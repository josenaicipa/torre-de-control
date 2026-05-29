import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { createPaymentSchema } from "@/lib/operaciones-validations";
import {
  derivePaymentFx,
  recalculateSchedule,
  validatePaymentAmountForAccount,
} from "@/lib/operaciones-payment-fx";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: { mentorUserId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    const payments = await prisma.payment.findMany({
      where: { studentId: id },
      orderBy: { paidAt: "desc" },
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        schedule: { select: { id: true, installmentNumber: true } },
        paymentAccount: {
          select: {
            id: true,
            displayName: true,
            currency: true,
            ownerName: true,
            providerName: true,
          },
        },
      },
    });
    return NextResponse.json({ payments });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");

    const body = createPaymentSchema.parse(await req.json());

    const paidAt = new Date(`${body.paidAt}T12:00:00.000Z`);

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.paymentAccount.findUnique({
        where: { id: body.paymentAccountId },
        select: { id: true, isActive: true, currency: true },
      });
      if (!account) {
        return { ok: false as const, error: "La cuenta receptora no existe" };
      }
      if (!account.isActive) {
        return { ok: false as const, error: "La cuenta receptora no está activa" };
      }

      // Per-account-currency cap: USD cuenta hereda el techo histórico de 1M
      // USD; cualquier otra moneda usa el techo local de 1B. El schema solo
      // sabe del techo local porque no conoce la cuenta, así que el route es
      // el que decide.
      const limitCheck = validatePaymentAmountForAccount(
        body.amount,
        account.currency,
      );
      if (!limitCheck.ok) {
        return { ok: false as const, error: limitCheck.error };
      }

      const fx = derivePaymentFx({
        amount: body.amount,
        accountCurrency: account.currency,
        exchangeRate: body.exchangeRate ?? null,
        officialAmountUsd: body.officialAmountUsd ?? null,
      });
      if (!fx.ok) return { ok: false as const, error: fx.error };

      const schedule = body.scheduleId
        ? await tx.paymentSchedule.findUnique({
            where: { id: body.scheduleId },
            select: {
              studentId: true,
              enrollmentId: true,
            },
          })
        : null;
      if (body.scheduleId && (!schedule || schedule.studentId !== id)) {
        return { ok: false as const, error: "La cuota seleccionada no pertenece al estudiante" };
      }

      const created = await tx.payment.create({
        data: {
          studentId: id,
          scheduleId: body.scheduleId ?? null,
          enrollmentId: schedule?.enrollmentId ?? null,
          amount: body.amount,
          currency: fx.value.currency,
          officialAmountUsd: fx.value.officialAmountUsd,
          receivedAmount: fx.value.receivedAmount,
          receivedCurrency: fx.value.receivedCurrency,
          exchangeRate: fx.value.exchangeRate,
          paidAt,
          notes: body.notes ?? null,
          paymentAccountId: account.id,
          recordedById: actor.userId,
        },
      });

      // Canonical schedule recalculation: re-sum every payment's USD value
      // instead of doing an incremental update. Same code path as PATCH /
      // DELETE so the three branches can never diverge.
      if (body.scheduleId) {
        await recalculateSchedule(tx, body.scheduleId);
      }

      return { ok: true as const, payment: created };
    });
    if (!result.ok) return jsonError(400, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.payment.create",
      target: id,
      metadata: {
        amount: body.amount,
        currency: result.payment.currency,
        officialAmountUsd: result.payment.officialAmountUsd?.toString() ?? null,
        scheduleId: body.scheduleId,
        paymentAccountId: result.payment.paymentAccountId,
      },
    });

    return NextResponse.json({ payment: result.payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
