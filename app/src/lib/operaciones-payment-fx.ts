import { deriveScheduleStatus } from "../domain/payments";
import type { Prisma } from "@prisma/client";

// Derives the canonical USD value and the receipt-side fields of a Payment
// from the operator input (raw amount + optional overrides) and the
// receiving account. The account is the source of truth for the payment
// currency: a COP account always books a COP payment, regardless of what
// the form's currency dropdown may have said historically.
//
// Rules:
//  - USD account → currency=USD, officialAmountUsd=amount, receivedAmount=amount,
//    receivedCurrency=USD, exchangeRate=null.
//  - Non-USD account → currency=accountCurrency, receivedAmount=amount,
//    receivedCurrency=accountCurrency, exchangeRate required (from body or
//    derived from amount/officialAmountUsd), officialAmountUsd = either the
//    explicit override or amount/exchangeRate rounded to cents.

// USD payments historically capped at 1M; local currencies use a 1B ceiling
// (e.g. COP 1.500.000 ≈ USD 411 — far below the local cap). The schema does
// not know the booking currency until the route resolves it from the
// receiving account, so the route enforces this rule explicitly.
export const PAYMENT_AMOUNT_USD_MAX = 1_000_000;
export const PAYMENT_AMOUNT_LOCAL_MAX = 1_000_000_000;

export function validatePaymentAmountForAccount(
  amount: number,
  accountCurrency: string,
): { ok: true } | { ok: false; error: string } {
  const currency = (accountCurrency ?? "USD").toUpperCase();
  const limit =
    currency === "USD" ? PAYMENT_AMOUNT_USD_MAX : PAYMENT_AMOUNT_LOCAL_MAX;
  if (amount > limit) {
    const formatted = limit.toLocaleString("es-CO");
    return {
      ok: false,
      error: `El monto en ${currency} no puede exceder ${formatted}`,
    };
  }
  return { ok: true };
}

export interface DerivePaymentFxInput {
  amount: number;
  accountCurrency: string;
  // Explicit operator overrides (e.g. when the UI showed an auto-computed
  // value and the user typed a different one).
  exchangeRate?: number | null;
  officialAmountUsd?: number | null;
}

export interface DerivedPaymentFx {
  currency: string;
  receivedAmount: number;
  receivedCurrency: string;
  officialAmountUsd: number;
  exchangeRate: number | null;
}

export type DerivePaymentFxResult =
  | { ok: true; value: DerivedPaymentFx }
  | { ok: false; error: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function derivePaymentFx(
  input: DerivePaymentFxInput,
): DerivePaymentFxResult {
  const amount = input.amount;
  if (!(amount > 0)) {
    return { ok: false, error: "El monto del pago debe ser mayor a 0" };
  }
  const currency = (input.accountCurrency ?? "USD").toUpperCase();

  if (currency === "USD") {
    return {
      ok: true,
      value: {
        currency: "USD",
        receivedAmount: amount,
        receivedCurrency: "USD",
        officialAmountUsd: amount,
        exchangeRate: null,
      },
    };
  }

  const overrideUsd =
    input.officialAmountUsd != null && input.officialAmountUsd > 0
      ? input.officialAmountUsd
      : null;
  const rate =
    input.exchangeRate != null && input.exchangeRate > 0
      ? input.exchangeRate
      : overrideUsd != null
        ? round2(amount / overrideUsd)
        : null;

  if (rate == null && overrideUsd == null) {
    return {
      ok: false,
      error: `Tasa de cambio requerida para cuentas en ${currency}`,
    };
  }

  const officialAmountUsd =
    overrideUsd != null ? overrideUsd : round2(amount / (rate as number));
  if (!(officialAmountUsd > 0)) {
    return {
      ok: false,
      error: "El equivalente USD oficial debe ser mayor a 0",
    };
  }

  return {
    ok: true,
    value: {
      currency,
      receivedAmount: amount,
      receivedCurrency: currency,
      officialAmountUsd,
      exchangeRate: rate,
    },
  };
}

// PATCH /payments override resolver. The previous version always fell back
// to `existing.officialAmountUsd` when the body didn't carry an explicit
// USD override, which silently turned the stale stored USD into a forced
// override — so editing the COP amount or the FX rate kept the old USD
// instead of recomputing. Now:
//  - explicit `body.officialAmountUsd` (number or `null`) always wins;
//  - if `amount`, `exchangeRate` or `paymentAccountId` actually changed,
//    we return `null` so `derivePaymentFx` recomputes from amount/rate;
//  - only when nothing relevant moved do we conserve the existing override.
export interface ResolveOfficialUsdOverrideInput {
  body: {
    amount?: number;
    exchangeRate?: number | null;
    officialAmountUsd?: number | null;
    paymentAccountId?: string;
  };
  existing: {
    amount: number;
    exchangeRate: number | null;
    officialAmountUsd: number | null;
    paymentAccountId: string | null;
  };
}

export function resolveOfficialUsdOverride(
  input: ResolveOfficialUsdOverrideInput,
): number | null {
  if (input.body.officialAmountUsd !== undefined) {
    return input.body.officialAmountUsd;
  }
  const amountChanged =
    input.body.amount !== undefined &&
    input.body.amount !== input.existing.amount;
  const rateChanged =
    input.body.exchangeRate !== undefined &&
    input.body.exchangeRate !== input.existing.exchangeRate;
  const accountChanged =
    input.body.paymentAccountId !== undefined &&
    input.body.paymentAccountId !== input.existing.paymentAccountId;
  if (amountChanged || rateChanged || accountChanged) return null;
  return input.existing.officialAmountUsd;
}

// Canonical USD value of a payment row used for schedule recalculations.
// Mirrors `paymentUsdValue` in student-payments-finance.ts but typed for
// Prisma's Decimal | number | string return shape.
export function paymentUsdAmount(payment: {
  amount: unknown;
  currency: string | null;
  officialAmountUsd?: unknown;
}): number {
  const toNum = (value: unknown): number => {
    if (value == null) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  if (payment.officialAmountUsd != null && payment.officialAmountUsd !== "") {
    return toNum(payment.officialAmountUsd);
  }
  if ((payment.currency ?? "").toUpperCase() === "USD") {
    return toNum(payment.amount);
  }
  return 0;
}

// Recompute a schedule's amountPaid + status from scratch by summing the
// canonical USD value of every payment attached to it. Used by both POST and
// PATCH/DELETE on /payments so the schedule progression rule stays the same:
// schedule.amountPaid is always the sum of paymentUsdAmount() across the
// linked payments, never an incremental delta in the raw received currency.
export async function recalculateSchedule(
  tx: Prisma.TransactionClient,
  scheduleId: string,
): Promise<void> {
  const schedule = await tx.paymentSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      amountDue: true,
      dueDate: true,
      payments: {
        orderBy: { paidAt: "desc" },
        select: {
          amount: true,
          currency: true,
          officialAmountUsd: true,
          paidAt: true,
        },
      },
    },
  });
  if (!schedule) return;

  const amountPaid =
    Math.round(
      schedule.payments.reduce(
        (total, payment) => total + paymentUsdAmount(payment),
        0,
      ) * 100,
    ) / 100;
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
      paidAt:
        status === "PAID" ? schedule.payments[0]?.paidAt ?? new Date() : null,
    },
  });
}
