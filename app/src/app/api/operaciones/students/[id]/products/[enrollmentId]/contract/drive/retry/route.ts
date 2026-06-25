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
import {
  DriveApiError,
  DriveConfigError,
  uploadSignedContractPdfToDrive,
} from "@/lib/drive-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
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
        product: { select: { programLevel: true } },
        student: {
          select: { fullName: true, legalName: true, driveFolderId: true },
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
    const filename = buildSignedContractDriveFilename(studentName, programLevel);

    const now = new Date();
    try {
      const uploaded = await uploadSignedContractPdfToDrive(
        driveFolderId,
        filename,
        enrollment.signedPdfContent,
      );
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          signedPdfDriveFileId: uploaded.fileId || null,
          signedPdfDriveUrl: uploaded.webViewLink,
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
        signedPdfDriveUrl: uploaded.webViewLink,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error subiendo el PDF firmado a Drive";
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          signedPdfDriveUploadStatus: "error",
          signedPdfDriveUploadError: message.slice(0, 500),
          signatureFlowStatus: "DRIVE_ERROR",
        },
      });
      if (err instanceof DriveConfigError) return jsonError(503, message);
      if (err instanceof DriveApiError) return jsonError(502, message);
      throw err;
    }
  } catch (err) {
    return handleApiError(err);
  }
}
