import { deriveScheduleStatus } from "@/domain/payments";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updateScheduleSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; scheduleId: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, scheduleId } = await params;
    const body = updateScheduleSchema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentSchedule.findUnique({
        where: { id: scheduleId },
        select: {
          id: true,
          studentId: true,
          amountDue: true,
          amountPaid: true,
          currency: true,
          dueDate: true,
          paidAt: true,
        },
      });
      if (!existing || existing.studentId !== id) {
        return { ok: false as const, status: 404, error: "Cuota no encontrada" };
      }

      const amountDue = body.amountDue ?? Number(existing.amountDue);
      const dueDate = body.dueDate
        ? new Date(`${body.dueDate}T00:00:00.000Z`)
        : existing.dueDate;
      const status = deriveScheduleStatus(
        { amountDue, amountPaid: Number(existing.amountPaid), dueDate },
        new Date(),
      );
      const schedule = await tx.paymentSchedule.update({
        where: { id: scheduleId },
        data: {
          ...(body.amountDue !== undefined ? { amountDue: body.amountDue } : {}),
          ...(body.dueDate !== undefined ? { dueDate } : {}),
          status,
          paidAt: status === "PAID" ? existing.paidAt ?? new Date() : null,
        },
      });
      return {
        ok: true as const,
        schedule,
        before: {
          amountDue: Number(existing.amountDue),
          currency: existing.currency,
          dueDate: existing.dueDate.toISOString(),
        },
        after: {
          amountDue: Number(schedule.amountDue),
          currency: schedule.currency,
          dueDate: schedule.dueDate.toISOString(),
        },
      };
    });
    if (!result.ok) return jsonError(result.status, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.schedule.update",
      target: scheduleId,
      metadata: {
        studentId: id,
        before: result.before,
        after: result.after,
        changes: body,
      },
    });

    return NextResponse.json({ schedule: result.schedule });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, scheduleId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentSchedule.findUnique({
        where: { id: scheduleId },
        select: {
          id: true,
          studentId: true,
          installmentNumber: true,
          _count: { select: { payments: true } },
        },
      });
      if (!existing || existing.studentId !== id) {
        return { ok: false as const, status: 404, error: "Cuota no encontrada" };
      }
      if (existing._count.payments > 0) {
        return {
          ok: false as const,
          status: 409,
          error:
            "No se puede eliminar la cuota porque tiene pagos asignados. Primero desvinculá o eliminá esos pagos.",
        };
      }
      await tx.paymentSchedule.delete({ where: { id: scheduleId } });
      return { ok: true as const, installmentNumber: existing.installmentNumber };
    });
    if (!result.ok) return jsonError(result.status, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.schedule.delete",
      target: scheduleId,
      metadata: { studentId: id, installmentNumber: result.installmentNumber },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
