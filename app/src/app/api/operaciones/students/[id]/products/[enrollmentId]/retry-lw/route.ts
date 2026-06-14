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

    if (
      enrollment.contractStatus !== "APPROVED" &&
      enrollment.accessStatus !== "SYNC_ERROR"
    ) {
      return jsonError(
        400,
        "Solo se puede reintentar la sincronización con LearnWorlds si el contrato está aprobado o el acceso quedó en error",
      );
    }

    const lwResult = await enrollEnrollmentInLearnWorlds(enrollment.id);

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.retry_lw",
      target: enrollment.id,
      metadata: {
        studentId: id,
        productId: enrollment.product.id,
        accessStatus: lwResult.accessStatus,
        learnWorldsSyncStatus: lwResult.syncStatus,
        learnWorldsConfigCount: lwResult.configCount,
        learnWorldsError: lwResult.error,
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

    return NextResponse.json({ enrollment: updated, learnWorlds: lwResult });
  } catch (err) {
    return handleApiError(err);
  }
}
