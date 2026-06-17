import { prisma } from "@/lib/prisma";
import {
  ForbiddenError,
  getActor,
  requireActor,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import {
  buildContractInputFromData,
  contractEnrollmentSelect,
} from "@/lib/operaciones-contract";
import { generateSignedContractPdf } from "@/lib/operaciones-contract-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

// Descarga el PDF del contrato firmado y aprobado. Requiere login y acceso al
// estudiante. Solo genera el PDF si el contrato está APPROVED y existe
// evidencia de firma tanto del estudiante como del CEO.
export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
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
      select: { ...contractEnrollmentSelect, studentId: true },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    if (enrollment.contractStatus !== "APPROVED") {
      return jsonError(400, "El contrato aún no está aprobado");
    }
    if (
      !enrollment.contractStudentSignatureHash ||
      !enrollment.contractCeoSignatureHash
    ) {
      return jsonError(
        400,
        "Falta la evidencia de firma del estudiante o del CEO",
      );
    }

    const input = buildContractInputFromData(
      enrollment,
      enrollment.contractSignedAt,
    );
    const pdf = await generateSignedContractPdf({
      input,
      evidence: {
        studentSignerName: enrollment.contractSignerName,
        studentSignedAt: enrollment.contractSignedAt,
        studentSignedIp: enrollment.contractSignedIp,
        studentSignatureHash: enrollment.contractStudentSignatureHash,
        studentSignatureImage: enrollment.contractStudentSignatureImage,
        ceoSignerName: enrollment.contractCeoSignerName,
        ceoSignedAt: enrollment.contractCeoSignedAt,
        ceoSignatureHash: enrollment.contractCeoSignatureHash,
        templateVersion: enrollment.contractTemplateVersion,
      },
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrato-${enrollment.id}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
