import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { COMPANY } from "@/lib/operaciones-contract-template";
import {
  computeCeoSignatureHash,
  contractEnrollmentSelect,
  findMissingContractFields,
} from "@/lib/operaciones-contract";
import {
  renderSignedContractPdfForEnrollment,
  type SignedContractPdfEnrollment,
} from "@/lib/operaciones-contract-pdf";
import { buildSignedContractDriveFilename } from "@/lib/operaciones-signature-flow";
import { sendSignedContractToN8n } from "@/lib/n8n-operaciones-actions";
import { getJoseSignature } from "@/lib/operaciones-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

interface ArchiveSignedPdfResult {
  stored: boolean;
  // "uploaded" | "error" | "skipped": espeja el campo signedPdfDriveUploadStatus
  // que ya escribe el endpoint de retry de Drive.
  driveStatus: "uploaded" | "error" | "skipped" | "not_stored";
  error: string | null;
}

// Extrae fileId y URL del cuerpo que devuelve n8n de forma tolerante: el flujo
// puede responder un objeto, un array (toma el primer elemento) o usar nombres
// distintos para las mismas claves. Si no encaja nada, devuelve nulls.
function extractDriveInfoFromN8n(data: unknown): {
  fileId: string | null;
  url: string | null;
} {
  const candidate = Array.isArray(data) ? data[0] : data;
  if (!candidate || typeof candidate !== "object") {
    return { fileId: null, url: null };
  }
  const record = candidate as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  };
  return {
    fileId: pick("driveFileId", "fileId"),
    url: pick("driveFileUrl", "webViewLink", "url"),
  };
}

// Genera el PDF firmado final de la inscripción ya aprobada, lo guarda en Torre
// (base64 + fecha) y, si hay carpeta de Drive, delega su subida a n8n vía
// webhook (best-effort). Nunca lanza: cualquier fallo se persiste en los campos
// signedPdf* y se devuelve para la auditoría, de modo que la aprobación siga su
// curso. El reintento manual vive en el endpoint contract/drive/retry, que
// reutiliza el PDF guardado.
async function archiveSignedContractPdf(params: {
  studentId: string;
  enrollmentId: string;
  signedEnrollment: SignedContractPdfEnrollment;
  filename: string;
  driveFolderId: string | null;
  email: string;
  fullName: string;
  legalName: string | null;
  productId: string;
  productName: string;
  programLevel: number;
}): Promise<ArchiveSignedPdfResult> {
  const {
    studentId,
    enrollmentId,
    signedEnrollment,
    filename,
    driveFolderId,
    email,
    fullName,
    legalName,
    productId,
    productName,
    programLevel,
  } = params;
  let base64: string;
  try {
    const pdf = await renderSignedContractPdfForEnrollment(signedEnrollment);
    base64 = pdf.toString("base64");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error generando el PDF firmado";
    const truncated = message.slice(0, 500);
    // No hay base64 que guardar (el PDF nunca llegó a generarse), pero el fallo
    // debe quedar visible en BD para diagnóstico y reintento manual. No tocamos
    // signedPdfContent porque no existe documento.
    await prisma.studentProductEnrollment.update({
      where: { id: enrollmentId },
      data: {
        signedPdfDriveUploadStatus: "error",
        signedPdfDriveUploadError: truncated,
        signatureFlowStatus: "DRIVE_ERROR",
      },
    });
    return { stored: false, driveStatus: "not_stored", error: truncated };
  }

  const storedAt = new Date();
  const driveFolder = driveFolderId?.trim();
  if (!driveFolder) {
    await prisma.studentProductEnrollment.update({
      where: { id: enrollmentId },
      data: {
        signedPdfContent: base64,
        signedPdfStoredAt: storedAt,
        signedPdfDriveUploadStatus: "skipped",
        signedPdfDriveUploadError: null,
        signatureFlowStatus: "PDF_STORED",
      },
    });
    return { stored: true, driveStatus: "skipped", error: null };
  }

  const result = await sendSignedContractToN8n({
    studentEmail: email,
    studentId,
    enrollmentId,
    email,
    fullName,
    legalName,
    productId,
    name: productName,
    programLevel,
    driveFolderId: driveFolder,
    filename,
    pdfBase64: base64,
    contractStatus: "APPROVED",
  });

  if (result.ok) {
    const { fileId, url } = extractDriveInfoFromN8n(result.data);
    await prisma.studentProductEnrollment.update({
      where: { id: enrollmentId },
      data: {
        signedPdfContent: base64,
        signedPdfStoredAt: storedAt,
        signedPdfDriveFileId: fileId,
        signedPdfDriveUrl: url,
        signedPdfDriveUploadedAt: storedAt,
        signedPdfDriveUploadStatus: "uploaded",
        signedPdfDriveUploadError: null,
        signatureFlowStatus: "DRIVE_UPLOADED",
      },
    });
    return { stored: true, driveStatus: "uploaded", error: null };
  }

  // El PDF sí se guardó en Torre: persistimos el contenido y marcamos el error
  // de n8n para poder reintentar la subida sin regenerar el documento.
  const truncated = result.error.slice(0, 500);
  await prisma.studentProductEnrollment.update({
    where: { id: enrollmentId },
    data: {
      signedPdfContent: base64,
      signedPdfStoredAt: storedAt,
      signedPdfDriveUploadStatus: "error",
      signedPdfDriveUploadError: truncated,
      signatureFlowStatus: "DRIVE_ERROR",
    },
  });
  return { stored: true, driveStatus: "error", error: truncated };
}

// Aprueba el contrato desde Torre: registra la firma del CEO (Jose David
// Naicipa Jiménez) y archiva el PDF firmado. El acceso en LearnWorlds NO se
// libera aquí: queda pendiente hasta que el operador pulse "Conceder acceso".
// Solo aprueba contratos realmente FIRMADOS con evidencia de firma electrónica
// del estudiante (hash y fecha) y con todos los datos legales/comerciales
// completos.
export async function POST(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, enrollmentId } = await params;

    // La firma manuscrita de Jose Naicipa se configura una sola vez en
    // Operaciones › Configuración y se reutiliza aquí automáticamente. Al
    // aprobar se congela una copia en el enrollment como evidencia del contrato.
    const joseSignature = await getJoseSignature();
    if (!joseSignature) {
      return jsonError(
        400,
        "Primero configura la firma fija de Jose Naicipa en Operaciones > Configuración",
      );
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, mentorUserId: true, driveFolderId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    const enrollment = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        ...contractEnrollmentSelect,
        studentId: true,
        installmentCount: true,
        product: {
          select: {
            id: true,
            name: true,
            requiresInitialPayment: true,
            programLevel: true,
          },
        },
        payments: { select: { isInitialPayment: true } },
        _count: { select: { paymentSchedules: true } },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    // El contrato se considera firmado por el estudiante tanto en SIGNED como
    // en PENDING_APPROVAL (estado que la UI muestra como "Pendiente aprobación"
    // y que puede provenir de registros legacy/en transición). La firma real se
    // valida más abajo exigiendo la evidencia (contractSignedAt + hash).
    if (
      enrollment.contractStatus !== "SIGNED" &&
      enrollment.contractStatus !== "PENDING_APPROVAL"
    ) {
      return jsonError(
        400,
        "El contrato debe estar firmado por el estudiante para poder aprobarlo",
      );
    }

    // No aprobar un contrato con datos legales/comerciales incompletos: los
    // datos pudieron cambiar desde que se firmó.
    const missingFields = findMissingContractFields(enrollment);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error:
            "El contrato tiene datos incompletos y no puede aprobarse. Completa los datos y regenera la firma.",
          missingFields,
        },
        { status: 400 },
      );
    }

    if (!enrollment.contractStudentSignatureHash || !enrollment.contractSignedAt) {
      return jsonError(
        400,
        "Falta la evidencia de firma electrónica del estudiante; no se puede aprobar",
      );
    }

    if (
      enrollment.product.requiresInitialPayment &&
      !enrollment.payments.some((p) => p.isInitialPayment)
    ) {
      return jsonError(
        400,
        "Este producto requiere un pago inicial registrado antes de aprobar el contrato",
      );
    }

    const balanceUsd = Number(enrollment.balanceUsd ?? 0);
    const installmentCount = enrollment.installmentCount ?? 0;
    if (
      balanceUsd > 0 &&
      installmentCount > 0 &&
      enrollment._count.paymentSchedules === 0
    ) {
      return jsonError(
        400,
        "El saldo financiado requiere un plan de cuotas antes de aprobar el contrato",
      );
    }

    const now = new Date();
    const ceoName = COMPANY.ceoName;
    const ceoHash = computeCeoSignatureHash(
      enrollment.contractStudentSignatureHash,
      ceoName,
      now,
    );

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "APPROVED",
        contractApprovedAt: now,
        contractApprovedById: actor.userId,
        contractCeoSignerName: ceoName,
        contractCeoSignedAt: now,
        contractCeoSignedById: actor.userId,
        contractCeoSignatureHash: ceoHash,
        contractCeoSignatureImage: joseSignature.dataUrl,
        contractRejectedAt: null,
        contractRejectionReason: null,
        accessStatus: "PENDING",
        learnWorldsSyncStatus: "pending",
        learnWorldsSyncError: null,
      },
    });

    // Genera y archiva el PDF firmado final (con la firma del CEO recién
    // registrada) y, si el estudiante ya tiene carpeta de Drive sincronizada,
    // delega su subida a n8n. Todo esto es best-effort: un fallo al generar o
    // subir el PDF NO debe bloquear la aprobación; el error queda visible en los
    // campos signedPdf* y en la auditoría para reintentar luego desde el
    // endpoint de retry. El acceso a LearnWorlds NO se libera aquí.
    const programLevel =
      enrollment.programLevelSnapshot ?? enrollment.product.programLevel ?? 0;
    const studentName =
      enrollment.student.legalName?.trim() ||
      enrollment.student.fullName ||
      "Estudiante";
    const signedEnrollment: SignedContractPdfEnrollment = {
      ...enrollment,
      contractCeoSignerName: ceoName,
      contractCeoSignedAt: now,
      contractCeoSignatureHash: ceoHash,
      contractCeoSignatureImage: joseSignature.dataUrl,
    };
    const pdfEvidence = await archiveSignedContractPdf({
      studentId: id,
      enrollmentId: enrollment.id,
      signedEnrollment,
      filename: buildSignedContractDriveFilename(studentName),
      driveFolderId: student.driveFolderId,
      email: enrollment.student.email,
      fullName: enrollment.student.fullName,
      legalName: enrollment.student.legalName,
      productId: enrollment.product.id,
      productName: enrollment.product.name,
      programLevel,
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.approve_contract",
      target: enrollment.id,
      metadata: {
        studentId: id,
        productId: enrollment.product.id,
        accessStatus: "PENDING",
        learnWorldsDeferred: true,
        learnWorldsNote: "Pendiente de botón Conceder acceso",
        signedPdfStored: pdfEvidence.stored,
        signedPdfDriveStatus: pdfEvidence.driveStatus,
        signedPdfError: pdfEvidence.error,
      },
    });

    const updated = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollment.id },
      include: {
        product: {
          include: {
            learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
          },
        },
        paymentAccount: true,
        payments: { orderBy: { paidAt: "desc" } },
        paymentSchedules: { orderBy: { installmentNumber: "asc" } },
      },
    });

    return NextResponse.json({
      enrollment: updated,
      learnWorlds: { deferred: true, accessStatus: "PENDING" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
