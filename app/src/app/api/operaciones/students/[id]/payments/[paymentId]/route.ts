import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updatePaymentSchema } from "@/lib/operaciones-validations";
import {
  derivePaymentFx,
  recalculateSchedule,
  resolveOfficialUsdOverride,
  validatePaymentAmountForAccount,
} from "@/lib/operaciones-payment-fx";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; paymentId: string }>;
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
          exchangeRate: true,
          officialAmountUsd: true,
        },
      });
      if (!existing || existing.studentId !== id) {
        return { ok: false as const, status: 404, error: "Pago no encontrado" };
      }

      // The effective receiving account is the one the body asks for, or
      // the one already on the row. Legacy rows without an account cannot
      // be edited through the normal flow — the UI keeps them read-only.
      const effectiveAccountId =
        body.paymentAccountId !== undefined
          ? body.paymentAccountId
          : existing.paymentAccountId;
      if (!effectiveAccountId) {
        return {
          ok: false as const,
          status: 400,
          error: "La cuenta receptora es obligatoria para editar el pago",
        };
      }

      const account = await tx.paymentAccount.findUnique({
        where: { id: effectiveAccountId },
        select: { id: true, isActive: true, currency: true },
      });
      if (!account) {
        return { ok: false as const, status: 400, error: "La cuenta receptora no existe" };
      }
      // Allow keeping an already-linked inactive account, but reject moving
      // a payment onto a freshly-deactivated one.
      if (!account.isActive && account.id !== existing.paymentAccountId) {
        return { ok: false as const, status: 400, error: "La cuenta receptora no está activa" };
      }

      const effectiveAmount =
        body.amount !== undefined ? body.amount : Number(existing.amount);

      // Mismo techo por moneda que en POST: USD máx 1M, local máx 1B. Aplica
      // sobre el monto efectivo (lo que el operador acaba moviendo en la
      // cuenta), no sobre el USD canónico.
      const limitCheck = validatePaymentAmountForAccount(
        effectiveAmount,
        account.currency,
      );
      if (!limitCheck.ok) {
        return { ok: false as const, status: 400, error: limitCheck.error };
      }

      const existingAmount = Number(existing.amount);
      const existingRate =
        existing.exchangeRate != null ? Number(existing.exchangeRate) : null;
      const existingUsd =
        existing.officialAmountUsd != null
          ? Number(existing.officialAmountUsd)
          : null;
      const effectiveRate =
        body.exchangeRate !== undefined ? body.exchangeRate : existingRate;
      // Do NOT default `officialAmountUsd` to `existing.officialAmountUsd`:
      // that would silently override the freshly recomputed USD whenever
      // the operator edited only `amount` or `exchangeRate`. See
      // `resolveOfficialUsdOverride` for the full rule.
      const officialAmountUsdInput = resolveOfficialUsdOverride({
        body: {
          amount: body.amount,
          exchangeRate: body.exchangeRate,
          officialAmountUsd: body.officialAmountUsd,
          paymentAccountId: body.paymentAccountId,
        },
        existing: {
          amount: existingAmount,
          exchangeRate: existingRate,
          officialAmountUsd: existingUsd,
          paymentAccountId: existing.paymentAccountId,
        },
      });

      const fx = derivePaymentFx({
        amount: effectiveAmount,
        accountCurrency: account.currency,
        exchangeRate: effectiveRate,
        officialAmountUsd: officialAmountUsdInput,
      });
      if (!fx.ok) {
        return { ok: false as const, status: 400, error: fx.error };
      }

      const newScheduleId =
        body.scheduleId !== undefined ? body.scheduleId : existing.scheduleId;
      let enrollmentId: string | null | undefined = undefined;
      if (newScheduleId) {
        const target = await tx.paymentSchedule.findUnique({
          where: { id: newScheduleId },
          select: { studentId: true, enrollmentId: true },
        });
        if (!target || target.studentId !== id) {
          return {
            ok: false as const,
            status: 400,
            error: "La cuota no pertenece a este estudiante",
          };
        }
        enrollmentId = target.enrollmentId;
      } else if (body.scheduleId === null) {
        enrollmentId = null;
      }

      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          amount: effectiveAmount,
          currency: fx.value.currency,
          officialAmountUsd: fx.value.officialAmountUsd,
          receivedAmount: fx.value.receivedAmount,
          receivedCurrency: fx.value.receivedCurrency,
          exchangeRate: fx.value.exchangeRate,
          paymentAccountId: account.id,
          ...(body.paidAt !== undefined
            ? { paidAt: new Date(`${body.paidAt}T12:00:00.000Z`) }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.scheduleId !== undefined ? { scheduleId: body.scheduleId } : {}),
          ...(enrollmentId !== undefined ? { enrollmentId } : {}),
        },
      });

      const affectedScheduleIds = new Set(
        [existing.scheduleId, newScheduleId].filter(
          (value): value is string => Boolean(value),
        ),
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
