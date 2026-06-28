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
import { enrollEnrollmentInLearnWorlds } from "@/lib/lw-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

const ENROLLMENT_INCLUDE = {
  product: {
    include: {
      learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
    },
  },
  paymentAccount: true,
  payments: { orderBy: { paidAt: "desc" } },
  paymentSchedules: { orderBy: { installmentNumber: "asc" } },
} as const;

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
        contractStatus: true,
        accessStatus: true,
        product: { select: { id: true } },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    // Idempotente: si el acceso ya está ACTIVE no volvemos a tocar LearnWorlds;
    // la UI solo necesita el enrollment fresco.
    if (enrollment.accessStatus === "ACTIVE") {
      const current = await prisma.studentProductEnrollment.findUnique({
        where: { id: enrollment.id },
        include: ENROLLMENT_INCLUDE,
      });
      return NextResponse.json({
        enrollment: current,
        learnWorlds: { ok: true, accessStatus: "ACTIVE", alreadyActive: true },
      });
    }

    if (
      enrollment.contractStatus !== "APPROVED" &&
      enrollment.accessStatus !== "SYNC_ERROR"
    ) {
      return jsonError(
        400,
        "Solo se puede reintentar la sincronización con LearnWorlds si el contrato está aprobado o el acceso quedó en error",
      );
    }

    // lw-client es la fuente de verdad del aprovisionamiento: lee los configs
    // activos del producto, enrola (y revoca el nivel anterior en upgrades) y
    // ya persiste accessStatus ACTIVE/SYNC_ERROR + learnWorldsSync* en el
    // enrollment. Aquí solo auditamos y devolvemos el enrollment fresco.
    const result = await enrollEnrollmentInLearnWorlds(enrollment.id);

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.retry_lw",
      target: enrollment.id,
      metadata: {
        studentId: id,
        productId: enrollment.product.id,
        accessStatus: result.accessStatus,
        learnWorldsSyncStatus: result.syncStatus,
        learnWorldsConfigCount: result.configCount,
        learnWorldsEnrolledCount: result.enrolledCount,
        learnWorldsRevokedCount: result.revokedCount,
        ...(result.revokeError
          ? { learnWorldsRevokeError: result.revokeError }
          : {}),
        ...(result.error ? { learnWorldsError: result.error } : {}),
      },
    });

    const updated = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollment.id },
      include: ENROLLMENT_INCLUDE,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          enrollment: updated,
          learnWorlds: {
            ok: false,
            accessStatus: result.accessStatus,
            error: result.error,
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      enrollment: updated,
      learnWorlds: { ok: true, accessStatus: result.accessStatus },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
