import { NextResponse } from "next/server";
import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { calculateEndDate, deriveDurationMonths } from "@/domain/students";
import {
  buildContractLinkResetData,
  canChangeContractTemplateKind,
} from "@/lib/operaciones-contract";
import { updateEnrollmentContractDatesSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

const CONTRACT_DATE_CHANGE_LOCKED_MESSAGE =
  "No se puede cambiar la fecha de inicio porque este contrato ya tiene firma.";

// Deriva la duración en meses que debe conservarse al mover la fecha de inicio:
// prefiere el delta start→end actual (si ambas existen y forman un número
// entero de meses), luego la duración del estudiante y, si nada aplica, null
// (el caller conserva el endsAt vigente).
function resolveDurationMonths(
  currentStartedAt: Date | null,
  currentEndsAt: Date | null,
  studentDurationMonths: number | null,
): number | null {
  if (currentStartedAt && currentEndsAt) {
    const derived = deriveDurationMonths(currentStartedAt, currentEndsAt);
    if (derived !== null) return derived;
  }
  if (
    studentDurationMonths !== null &&
    Number.isInteger(studentDurationMonths) &&
    studentDurationMonths >= 1
  ) {
    return studentDurationMonths;
  }
  return null;
}

// Edita la fecha de inicio del contrato de una inscripción ANTES de que se
// firme, recalculando la fecha de fin con la duración vigente. Solo permitido si
// ninguna de las dos partes firmó (misma regla que el cambio de tipo de
// contrato). Si había un link de firma pendiente, se invalida y el contrato
// vuelve a DRAFT porque las fechas cambiaron.
export async function PATCH(req: Request, { params }: Params) {
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
        startedAt: true,
        endsAt: true,
        contractStatus: true,
        contractSignedAt: true,
        contractCeoSignedAt: true,
        contractApprovedAt: true,
        contractUrl: true,
        student: { select: { durationMonths: true } },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    if (!canChangeContractTemplateKind(enrollment)) {
      return jsonError(400, CONTRACT_DATE_CHANGE_LOCKED_MESSAGE);
    }

    const body = updateEnrollmentContractDatesSchema.parse(await req.json());
    const newStartedAt = new Date(`${body.startedAt}T00:00:00.000Z`);

    const months = resolveDurationMonths(
      enrollment.startedAt,
      enrollment.endsAt,
      enrollment.student.durationMonths,
    );
    // Si no hay duración derivable ni del estudiante, conservamos el endsAt
    // vigente en lugar de borrarlo a null: perder la fecha de fin de forma
    // silenciosa al mover el inicio sería una pérdida de dato, no lo deseado.
    const newEndsAt =
      months !== null
        ? calculateEndDate(newStartedAt, months)
        : enrollment.endsAt;

    // Un link pendiente de firma congeló las fechas en sus snapshots; al mover
    // la fecha esos snapshots quedan obsoletos, así que se invalida el link y el
    // contrato vuelve a DRAFT para regenerarlo con las fechas nuevas.
    const hadPendingLink =
      enrollment.contractStatus === "PENDING_SIGNATURE" ||
      Boolean(enrollment.contractUrl);

    const updated = await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        startedAt: newStartedAt,
        endsAt: newEndsAt,
        ...(hadPendingLink ? buildContractLinkResetData() : {}),
      },
      select: { startedAt: true, endsAt: true, contractStatus: true },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.change_contract_dates",
      target: enrollment.id,
      metadata: {
        studentId: id,
        fromStartedAt: enrollment.startedAt?.toISOString() ?? null,
        toStartedAt: updated.startedAt?.toISOString() ?? null,
        fromEndsAt: enrollment.endsAt?.toISOString() ?? null,
        toEndsAt: updated.endsAt?.toISOString() ?? null,
        resetContractLink: hadPendingLink,
        previousContractStatus: enrollment.contractStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      startedAt: updated.startedAt,
      endsAt: updated.endsAt,
      contractStatus: updated.contractStatus,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
