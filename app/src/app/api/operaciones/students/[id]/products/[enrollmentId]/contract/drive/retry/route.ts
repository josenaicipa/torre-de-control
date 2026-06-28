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
import { buildSignedContractDriveFilename } from "@/lib/operaciones-signature-flow";
import { contractEnrollmentSelect } from "@/lib/operaciones-contract";
import { renderSignedContractPdfForEnrollment } from "@/lib/operaciones-contract-pdf";
import { sendSignedContractToN8n } from "@/lib/n8n-operaciones-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
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

// Reintenta subir a Drive el PDF firmado ya guardado en Torre, con el nombre
// exacto del blueprint. Útil cuando la subida automática del webhook falló
// (DRIVE_ERROR) o quedó en PDF_STORED sin carpeta al momento de completarse.
// No vuelve a contactar a DocuSeal: reutiliza el PDF guardado.
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
        id: true,
        studentId: true,
        signatureFlowStatus: true,
        signedPdfContent: true,
        programLevelSnapshot: true,
        product: { select: { id: true, name: true, programLevel: true } },
        student: {
          select: {
            email: true,
            fullName: true,
            legalName: true,
            driveFolderId: true,
          },
        },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    if (!enrollment.signedPdfContent) {
      return jsonError(
        400,
        "Todavía no hay PDF firmado guardado en Torre; no se puede subir a Drive",
      );
    }
    const driveFolderId = enrollment.student.driveFolderId;
    if (!driveFolderId) {
      return jsonError(
        400,
        "El estudiante no tiene carpeta de Drive sincronizada; no se puede subir el PDF firmado",
      );
    }

    const programLevel =
      enrollment.programLevelSnapshot ?? enrollment.product?.programLevel ?? 0;
    const studentName =
      enrollment.student.legalName?.trim() || enrollment.student.fullName || "Estudiante";
    const filename = buildSignedContractDriveFilename(studentName);

    const now = new Date();
    const result = await sendSignedContractToN8n({
      studentId: id,
      enrollmentId: enrollment.id,
      studentEmail: enrollment.student.email,
      email: enrollment.student.email,
      fullName: enrollment.student.fullName,
      legalName: enrollment.student.legalName,
      productId: enrollment.product?.id,
      productName: enrollment.product?.name,
      programLevel,
      driveFolderId,
      filename,
      pdfBase64: enrollment.signedPdfContent,
      contractStatus: "APPROVED",
      retry: true,
    });

    if (result.ok) {
      const { fileId, url } = extractDriveInfoFromN8n(result.data);
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          signedPdfDriveFileId: fileId,
          signedPdfDriveUrl: url,
          signedPdfDriveUploadedAt: now,
          signedPdfDriveUploadStatus: "uploaded",
          signedPdfDriveUploadError: null,
          signatureFlowStatus: "DRIVE_UPLOADED",
        },
      });
      await writeAudit({
        actorId: actor.userId,
        action: "operaciones.student_product_enrollment.drive_retry",
        target: enrollment.id,
        metadata: { studentId: id, signatureFlowStatus: "DRIVE_UPLOADED", filename },
      });
      return NextResponse.json({
        signatureFlowStatus: "DRIVE_UPLOADED",
        signedPdfDriveUrl: url,
      });
    }

    const message = result.error;
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        signedPdfDriveUploadStatus: "error",
        signedPdfDriveUploadError: message.slice(0, 500),
        signatureFlowStatus: "DRIVE_ERROR",
      },
    });
    return jsonError(502, message);
  } catch (err) {
    return handleApiError(err);
  }
}
