import { randomBytes } from "node:crypto";
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
import {
  contractEnrollmentSelect,
  findMissingContractFields,
  parseManualClausesSnapshot,
  serializeManualClausesSnapshot,
} from "@/lib/operaciones-contract";
import { getManualContractClauses } from "@/lib/operaciones-settings";
import { buildContractSignatureToken } from "@/lib/operaciones-signature-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

// Crea (o regenera) el link de firma del contrato de inscripción en Torre.
// Antes de mintear el token valida que existan TODOS los datos legales y
// comerciales obligatorios; si falta cualquiera responde 400 con la lista de
// `missingFields` y NO genera token. No integra GHL Documents: deja la
// inscripción en PENDING_SIGNATURE con una URL pública /contratos/firmar/<token>.
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
      select: { ...contractEnrollmentSelect, studentId: true },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }
    if (enrollment.contractStatus === "APPROVED") {
      return jsonError(
        400,
        "El contrato ya está aprobado; no se puede regenerar el link de firma",
      );
    }

    const missingFields = findMissingContractFields(enrollment);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Faltan datos para generar el contrato",
          missingFields,
        },
        { status: 400 },
      );
    }

    const token = buildContractSignatureToken(
      enrollment.student.legalName?.trim() || enrollment.student.fullName,
      randomBytes(8).toString("hex"),
    );
    const contractUrl = `/contratos/firmar/${token}`;

    // Congela las cláusulas manuales vigentes en el enrollment: si Operaciones
    // ya personalizó este contrato, conserva ese snapshot; si no, inicializa
    // desde la configuración global vigente.
    const clausesSnapshot =
      enrollment.contractManualClausesSnapshot ??
      serializeManualClausesSnapshot(
        (await getManualContractClauses())?.clauses ?? [],
      );
    const clausesCount = parseManualClausesSnapshot(clausesSnapshot)?.length ?? 0;

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "PENDING_SIGNATURE",
        contractSignatureToken: token,
        contractSignatureTokenCreatedAt: new Date(),
        contractUrl,
        contractManualClausesSnapshot: clausesSnapshot,
        // Regenerar limpia firma previa, su evidencia y cualquier rechazo.
        contractSignedAt: null,
        contractSignerName: null,
        contractSignedIp: null,
        contractSignedUserAgent: null,
        contractTemplateVersion: null,
        contractAcceptanceText: null,
        contractStudentSignatureHash: null,
        contractRejectedAt: null,
        contractRejectionReason: null,
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.create_contract_link",
      target: enrollment.id,
      metadata: {
        studentId: id,
        contractStatus: "PENDING_SIGNATURE",
        regenerated: enrollment.contractStatus === "PENDING_SIGNATURE",
        clausesCount,
      },
    });

    return NextResponse.json({ contractUrl, contractStatus: "PENDING_SIGNATURE" });
  } catch (err) {
    return handleApiError(err);
  }
}
