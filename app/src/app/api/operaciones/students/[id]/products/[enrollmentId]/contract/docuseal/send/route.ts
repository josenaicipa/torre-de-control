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
  buildContractInputFromData,
  contractEnrollmentSelect,
  findMissingContractFields,
  parseContractSectionsSnapshot,
  parseManualClausesSnapshot,
} from "@/lib/operaciones-contract";
import { generateSignedContractPdf } from "@/lib/operaciones-contract-pdf";
import {
  createDocusealSubmission,
  DocusealApiError,
  DocusealConfigError,
} from "@/lib/docuseal-client";
import { signatureFlowLabel } from "@/lib/operaciones-signature-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

// Estados de firma electrónica ya cerrados: el contrato ya está firmado/guardado
// y reenviar a DocuSeal sería destructivo. Se permite (re)enviar desde NOT_SENT,
// los estados de firma en curso y los de error (reintento).
const FLOW_LOCKED_FOR_SEND = new Set(["COMPLETED", "PDF_STORED", "DRIVE_UPLOADED"]);

// Email del firmante de LA EMPRESA (Jose) en DocuSeal. Configurable por entorno
// para no acoplar al correo de soporte; cae al soporte oficial del contrato.
function companySignerEmail(): string {
  return process.env.DOCUSEAL_COMPANY_EMAIL?.trim() || COMPANY.supportEmail;
}

// Envía el contrato de inscripción a DocuSeal para firma electrónica de ambas
// partes (estudiante primero, Jose/empresa después). DocuSeal es la fuente de
// verdad de la firma: aquí solo generamos el PDF del contrato actual como
// documento a firmar, creamos la submission y dejamos la inscripción
// PENDING_SIGNATURES. No marca nada como firmado.
export async function POST(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, enrollmentId } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, mentorUserId: true },
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
        signatureFlowStatus: true,
        docusealSubmissionId: true,
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    if (enrollment.contractStatus === "APPROVED") {
      return jsonError(
        400,
        "El contrato ya está aprobado; no se puede reenviar a DocuSeal",
      );
    }
    if (FLOW_LOCKED_FOR_SEND.has(enrollment.signatureFlowStatus)) {
      return jsonError(
        400,
        `El flujo de firma ya está en «${signatureFlowLabel(enrollment.signatureFlowStatus)}»; no se puede reenviar a DocuSeal`,
      );
    }

    const studentEmail = enrollment.student.email?.trim();
    if (!studentEmail) {
      return jsonError(400, "El estudiante no tiene correo para enviar la firma");
    }

    // No enviar a firma un contrato con datos legales/comerciales incompletos.
    const missingFields = findMissingContractFields(enrollment);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error:
            "El contrato tiene datos incompletos y no puede enviarse a firma. Completa los datos.",
          missingFields,
        },
        { status: 400 },
      );
    }

    // PDF del contrato ACTUAL (sin firmas todavía) como documento a firmar en
    // DocuSeal. Se construye con el mismo generador que el PDF firmado, pero con
    // evidencia vacía: DocuSeal añade los campos de firma de cada parte.
    const manualClauses = parseManualClausesSnapshot(enrollment.contractManualClausesSnapshot) ?? [];
    const sectionsSnapshot =
      parseContractSectionsSnapshot(enrollment.contractSectionsSnapshot) ?? undefined;
    const input = buildContractInputFromData(
      enrollment,
      enrollment.contractSignedAt,
      manualClauses,
      sectionsSnapshot,
    );
    const pdf = await generateSignedContractPdf({
      input,
      evidence: {
        studentSignerName: null,
        studentSignedAt: null,
        studentSignedIp: null,
        studentSignatureHash: null,
        studentSignatureImage: null,
        ceoSignerName: null,
        ceoSignedAt: null,
        ceoSignatureHash: null,
        ceoSignatureImage: null,
        templateVersion: null,
      },
    });
    const documentBase64 = Buffer.from(pdf).toString("base64");

    const studentName = enrollment.student.legalName?.trim() || enrollment.student.fullName;

    let submission;
    try {
      submission = await createDocusealSubmission({
        signers: [
          { name: studentName, email: studentEmail, role: "student" },
          { name: COMPANY.ceoName, email: companySignerEmail(), role: "company" },
        ],
        documentBase64,
        documentFilename: "contrato.pdf",
        externalId: enrollment.id,
        sendEmail: true,
      });
    } catch (err) {
      if (err instanceof DocusealConfigError) {
        return jsonError(503, err.message);
      }
      if (err instanceof DocusealApiError) {
        // Deja rastro del error sin bloquear inscripciones legacy: marca el flujo
        // como DOCUSEAL_ERROR para que la UI ofrezca reintentar.
        await prisma.studentProductEnrollment.update({
          where: { id: enrollment.id },
          data: { signatureFlowStatus: "DOCUSEAL_ERROR", docusealStatus: "error" },
        });
        return jsonError(err.status >= 400 && err.status < 600 ? 502 : 502, err.message);
      }
      throw err;
    }

    // URL de firma del estudiante (primer firmante), si DocuSeal la devuelve.
    const studentSignerUrl =
      submission.signerUrls.find((s) => s.role === "student")?.url ??
      submission.signerUrls.find((s) => (s.email ?? "").toLowerCase() === studentEmail.toLowerCase())
        ?.url ??
      submission.signerUrls[0]?.url ??
      null;

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        docusealSubmissionId: submission.submissionId || null,
        docusealStatus: submission.status ?? "sent",
        signatureFlowStatus: "PENDING_SIGNATURES",
        // El contrato pasa a pendiente de firma. El caso APPROVED ya quedó
        // bloqueado arriba con un early-return. No tocamos evidencia legacy de
        // firma manual.
        contractStatus: "PENDING_SIGNATURE",
        ...(studentSignerUrl ? { contractUrl: studentSignerUrl } : {}),
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.docuseal_send",
      target: enrollment.id,
      metadata: {
        studentId: id,
        docusealSubmissionId: submission.submissionId || null,
        signatureFlowStatus: "PENDING_SIGNATURES",
      },
    });

    return NextResponse.json({
      docusealSubmissionId: submission.submissionId || null,
      signatureFlowStatus: "PENDING_SIGNATURES",
      contractUrl: studentSignerUrl,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
