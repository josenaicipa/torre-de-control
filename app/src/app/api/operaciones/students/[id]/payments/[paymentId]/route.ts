import { deriveScheduleStatus } from "@/domain/payments";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updatePaymentSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; paymentId: string }>;
}

async function recalculateSchedule(tx: Prisma.TransactionClient, scheduleId: string) {
  const schedule = await tx.paymentSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      amountDue: true,
      dueDate: true,
      payments: {
        orderBy: { paidAt: "desc" },
        select: { amount: true, paidAt: true },
      },
    },
  });
  if (!schedule) return;

  const amountPaid = schedule.payments.reduce(
    (total, payment) => total + Number(payment.amount),
    0,
  );
  const status = deriveScheduleStatus(
    {
      amountDue: Number(schedule.amountDue),
      amountPaid,
      dueDate: schedule.dueDate,
    },
    new Date(),
  );

  await tx.paymentSchedule.update({
    where: { id: scheduleId },
    data: {
      amountPaid,
      status,
      paidAt: status === "PAID" ? schedule.payments[0]?.paidAt ?? new Date() : null,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, paymentId } = await params;
    const body = updatePaymentSchema.parse(await req.json());

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          studentId: true,
          scheduleId: true,
          amount: true,
          currency: true,
          paidAt: true,
          paymentAccountId: true,
        },
      });
      if (!existing || existing.studentId !== id) {
        return { ok: false as const, status: 404, error: "Pago no encontrado" };
      }

      const scheduleId =
        body.scheduleId !== undefined ? body.scheduleId : existing.scheduleId;
      const currency = body.currency ?? existing.currency;
      if (scheduleId) {
        const target = await tx.paymentSchedule.findUnique({
          where: { id: scheduleId },
          select: { studentId: true, currency: true },
        });
        if (!target || target.studentId !== id) {
          return { ok: false as const, status: 400, error: "La cuota no pertenece a este estudiante" };
        }
        if (target.currency !== currency) {
          return { ok: false as const, status: 400, error: "La moneda del pago no coincide con la cuota" };
        }
      }

      if (body.paymentAccountId) {
        const account = await tx.paymentAccount.findUnique({
          where: { id: body.paymentAccountId },
          select: { id: true, isActive: true },
        });
        if (!account) {
          return { ok: false as const, status: 400, error: "La cuenta receptora no existe" };
        }
        if (!account.isActive) {
          return { ok: false as const, status: 400, error: "La cuenta receptora no está activa" };
        }
      }

      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          ...(body.amount !== undefined ? { amount: body.amount } : {}),
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.paidAt !== undefined
            ? { paidAt: new Date(`${body.paidAt}T12:00:00.000Z`) }
            : {}),
          ...(body.method !== undefined ? { method: body.method } : {}),
          ...(body.reference !== undefined ? { reference: body.reference } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.scheduleId !== undefined ? { scheduleId: body.scheduleId } : {}),
          ...(body.paymentAccountId !== undefined
            ? { paymentAccountId: body.paymentAccountId }
            : {}),
        },
      });

      const affectedScheduleIds = new Set(
        [existing.scheduleId, scheduleId].filter((value): value is string => Boolean(value)),
      );
      for (const affectedScheduleId of affectedScheduleIds) {
        await recalculateSchedule(tx, affectedScheduleId);
      }

      return {
        ok: true as const,
        payment,
        before: {
          amount: Number(existing.amount),
          currency: existing.currency,
          paidAt: existing.paidAt.toISOString(),
          scheduleId: existing.scheduleId,
        },
        after: {
          amount: Number(payment.amount),
          currency: payment.currency,
          paidAt: payment.paidAt.toISOString(),
          scheduleId: payment.scheduleId,
        },
      };
    });
    if (!result.ok) return jsonError(result.status, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.payment.update",
      target: paymentId,
      metadata: {
        studentId: id,
        before: result.before,
        after: result.after,
        changes: body,
      },
    });

    return NextResponse.json({ payment: result.payment });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, paymentId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          studentId: true,
          scheduleId: true,
          amount: true,
          currency: true,
        },
      });
      if (!existing || existing.studentId !== id) {
        return { ok: false as const };
      }
      await tx.payment.delete({ where: { id: paymentId } });
      if (existing.scheduleId) {
        await recalculateSchedule(tx, existing.scheduleId);
      }
      return {
        ok: true as const,
        deleted: {
          amount: Number(existing.amount),
          currency: existing.currency,
          scheduleId: existing.scheduleId,
        },
      };
    });
    if (!result.ok) return jsonError(404, "Pago no encontrado");

    await writeAudit({
      actorId: actor.userId,
      action: "student.payment.delete",
      target: paymentId,
      metadata: { studentId: id, ...result.deleted },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
