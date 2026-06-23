/**
 * Pure domain helpers for program-level upgrades.
 *
 * An upgrade is a NEW enrollment related to a previous one (never a destructive
 * edit). The credit applied is what the student *actually paid* on the prior
 * level(s); the net to pay is the new gross price minus that credit. These
 * helpers are deterministic and side-effect free so the API route and the UI
 * preview agree on the math and they are trivial to unit test.
 */

export type Numeric = number | string | { toString(): string };

function toNumber(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Two cents of slack to mask floating-point drift. */
const MONEY_EPSILON = 0.01;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Whether a student on `currentLevel` can upgrade to `targetLevel`. Only moves
 * UP the ladder are allowed (N3→N4, N3→N5, N4→N5). Equal or lower levels, or
 * unknown/missing levels, are rejected. Levels are compared numerically so the
 * catalog stays configurable (no hardcoded slug list here).
 */
export function canUpgradeToLevel(
  currentLevel: number | null | undefined,
  targetLevel: number | null | undefined,
): boolean {
  if (currentLevel == null || targetLevel == null) return false;
  if (!Number.isFinite(currentLevel) || !Number.isFinite(targetLevel)) return false;
  return targetLevel > currentLevel;
}

export interface PaymentForCredit {
  /** Canonical USD value once FX has been resolved. Preferred when present. */
  officialAmountUsd?: Numeric | null;
  amount: Numeric;
  currency?: string | null;
}

/**
 * Credit for an upgrade = the sum of what the student REALLY paid on the prior
 * enrollment(s). Uses `officialAmountUsd` when present; otherwise falls back to
 * `amount` only when the currency is unset or USD. Non-USD payments without an
 * official USD value are ignored on purpose — summing mixed currencies as USD
 * would inflate the credit. Mirrors calculateEnrollmentBalance's conservative
 * rule so credit can never exceed the recognized paid USD.
 */
export function calculateUpgradeCredit(payments: PaymentForCredit[]): number {
  let credit = 0;
  for (const payment of payments) {
    if (payment.officialAmountUsd !== null && payment.officialAmountUsd !== undefined) {
      credit += toNumber(payment.officialAmountUsd);
      continue;
    }
    const currency = (payment.currency ?? "USD").toUpperCase();
    if (currency === "USD") {
      credit += toNumber(payment.amount);
    }
  }
  return round2(Math.max(0, credit));
}

export interface UpgradeAmounts {
  grossProgramPriceUsd: number;
  upgradeCreditUsd: number;
  /** New amount the student must pay: gross − credit, floored at 0. */
  netAmountUsd: number;
  /** True when the prior credit already covers the new gross price. */
  fullyCoveredByCredit: boolean;
}

/**
 * Computes the money breakdown for an upgrade. The credit is capped at the new
 * gross price so the net never goes negative (Torre does not issue refunds on
 * upgrades — excess credit is simply not charged).
 */
export function buildUpgradeAmounts(
  grossNewPriceUsd: Numeric,
  creditUsd: Numeric,
): UpgradeAmounts {
  const gross = round2(Math.max(0, toNumber(grossNewPriceUsd)));
  const rawCredit = round2(Math.max(0, toNumber(creditUsd)));
  const appliedCredit = Math.min(rawCredit, gross);
  const net = round2(Math.max(0, gross - appliedCredit));
  return {
    grossProgramPriceUsd: gross,
    upgradeCreditUsd: round2(appliedCredit),
    netAmountUsd: net,
    fullyCoveredByCredit: net <= MONEY_EPSILON,
  };
}
