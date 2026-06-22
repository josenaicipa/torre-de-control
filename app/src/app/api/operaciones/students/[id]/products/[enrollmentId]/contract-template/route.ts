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
import {
  CONTRACT_TEMPLATE_CHANGE_LOCKED_MESSAGE,
  buildContractTemplateResetData,
  canChangeContractTemplateKind,
  contractEnrollmentSelect,
} from "@/lib/operaciones-contract";
import { changeContractTemplateSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

// Cambia el tipo de contrato (Tradicional/Empresarial) de una inscripción
// existente. Solo permitido si ninguna de las dos partes firmó: al cambiar deja
// la inscripción con un contrato NUEVO/no emitido (DRAFT) y borra link de firma,
// snapshots y toda evidencia previa, invalidando cualquier link anterior.
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
      select: { ...contractEnrollmentSelect, studentId: true },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    const body = changeContractTemplateSchema.parse(await req.json());

    // Mismo tipo: no-op claro, sin reset destructivo.
    if (enrollment.contractTemplateKind === body.contractTemplateKind) {
      return NextResponse.json({
        ok: true,
        changed: false,
        contractTemplateKind: enrollment.contractTemplateKind,
        contractStatus: enrollment.contractStatus,
      });
    }

    if (!canChangeContractTemplateKind(enrollment)) {
      return jsonError(400, CONTRACT_TEMPLATE_CHANGE_LOCKED_MESSAGE);
    }

    const previousTemplateKind = enrollment.contractTemplateKind;
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: buildContractTemplateResetData(body.contractTemplateKind),
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.change_contract_template",
      target: enrollment.id,
      metadata: {
        studentId: id,
        from: previousTemplateKind,
        to: body.contractTemplateKind,
        previousContractStatus: enrollment.contractStatus,
      },
    });

    return NextResponse.json({
      ok: true,
      changed: true,
      contractTemplateKind: body.contractTemplateKind,
      contractStatus: "DRAFT",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
