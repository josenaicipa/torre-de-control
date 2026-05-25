import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireMentorOrAbove,
  ForbiddenError,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; metricId: string }>;
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireMentorOrAbove(actor);
    const { id, metricId } = await params;

    const existing = await prisma.studentMonthlyMetrics.findUnique({
      where: { id: metricId },
      select: {
        id: true,
        studentId: true,
        year: true,
        month: true,
        currency: true,
        student: { select: { mentorUserId: true } },
      },
    });
    if (!existing || existing.studentId !== id) {
      return jsonError(404, "Métrica no encontrada");
    }
    if (actor.role === "MENTOR" && !canAccessStudent(actor, existing.student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    await prisma.studentMonthlyMetrics.delete({ where: { id: metricId } });

    await writeAudit({
      actorId: actor.userId,
      action: "student.monthly_metrics.delete",
      target: id,
      metadata: {
        metricId,
        year: existing.year,
        month: existing.month,
        currency: existing.currency,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
