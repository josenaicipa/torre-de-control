/**
 * Pure domain helpers for the Operaciones products architecture (PR1).
 *
 * Every export is deterministic and side-effect free: no DB access, no I/O,
 * no `Date.now()` reads except where the caller passes the reference date in
 * explicitly. That keeps these usable both server-side (API routes, jobs) and
 * client-side (forms previewing what an action will do) and trivial to unit
 * test.
 *
 * The Prisma schema mirrors the enums declared here; keep the two in sync.
 */

export type ProductSaleLimit = "ONE_PER_STUDENT" | "UNLIMITED";

export type EnrollmentStatus =
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type MentorshipStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "FINISHED";

export type AccessStatus =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED"
  | "SYNC_ERROR";

export type InitialPaymentType =
  | "FULL_PAYMENT"
  | "DOWN_PAYMENT"
  | "RESERVATION";

export type StudentLifecycleStatus =
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "DROPPED"
  | "EXTENDED"
  | "ACCESS_REVOKED"
  | "SEPARATED"
  | "INACTIVE"
  | "WITHDRAWN";

/** A loose numeric input — `Decimal` from Prisma serializes as string in JSON,
 * so helpers accept the union to avoid forcing callers to pre-convert. */
export type Numeric = number | string;

function toNumber(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Two cents of slack — masks floating-point drift without hiding real errors. */
const MONEY_EPSILON = 0.01;

/** Rounds to two decimals using banker-safe half-up (no `toFixed` strings). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ─── calculateEnrollmentBalance ─────────────────────────────────────────────

export interface PaymentForBalance {
  /** Canonical USD value once FX has been resolved. Preferred when present. */
  officialAmountUsd?: Numeric | null;
  /** Raw recorded amount; assumed USD only if `currency` is "USD" or absent. */
  amount: Numeric;
  currency?: string | null;
}

export interface EnrollmentBalance {
  paidUsd: number;
  balanceUsd: number;
  isPaidInFull: boolean;
}

/**
 * Returns paid vs. outstanding USD for an enrollment.
 *
 * A payment counts toward the balance using `officialAmountUsd` when set;
 * otherwise it falls back to `amount` only when the currency is unset or USD.
 * Non-USD payments without an official USD value are ignored — the caller is
 * expected to resolve FX before treating the balance as authoritative. This is
 * deliberately conservative: silently summing mixed currencies as USD would
 * produce wrong numbers on the dashboard.
 */
export function calculateEnrollmentBalance(
  totalPriceUsd: Numeric,
  payments: PaymentForBalance[],
): EnrollmentBalance {
  const total = toNumber(totalPriceUsd);
  let paid = 0;
  for (const payment of payments) {
    if (payment.officialAmountUsd !== null && payment.officialAmountUsd !== undefined) {
      paid += toNumber(payment.officialAmountUsd);
      continue;
    }
    const currency = (payment.currency ?? "USD").toUpperCase();
    if (currency === "USD") {
      paid += toNumber(payment.amount);
    }
  }
  const paidUsd = round2(paid);
  const balanceUsd = round2(total - paidUsd);
  return {
    paidUsd,
    balanceUsd,
    isPaidInFull: balanceUsd <= MONEY_EPSILON,
  };
}

// ─── calculateInstallments ──────────────────────────────────────────────────

export type InstallmentFrequency = "monthly" | "biweekly";

export interface InstallmentPlanRow {
  installmentNumber: number;
  amountDue: number;
  dueDate: Date;
}

/**
 * Splits `totalPriceUsd` into `installments` rows with due dates derived from
 * `firstDueDate` + frequency. Rounding goes to two decimals on the first n-1
 * rows and the last row absorbs the remainder so the sum equals the total to
 * the cent.
 */
export function calculateInstallments(
  totalPriceUsd: Numeric,
  installments: number,
  firstDueDate: Date,
  frequency: InstallmentFrequency = "monthly",
): InstallmentPlanRow[] {
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error("installments must be a positive integer");
  }
  if (Number.isNaN(firstDueDate.getTime())) {
    throw new Error("firstDueDate must be a valid Date");
  }
  const total = round2(toNumber(totalPriceUsd));
  if (total < 0) {
    throw new Error("totalPriceUsd must be >= 0");
  }

  const perInstallment = round2(total / installments);
  const rows: InstallmentPlanRow[] = [];
  let runningTotal = 0;

  for (let i = 0; i < installments; i += 1) {
    const isLast = i === installments - 1;
    const amount = isLast ? round2(total - runningTotal) : perInstallment;
    runningTotal = round2(runningTotal + amount);
    rows.push({
      installmentNumber: i + 1,
      amountDue: amount,
      dueDate: addPeriods(firstDueDate, i, frequency),
    });
  }

  return rows;
}

function addPeriods(base: Date, index: number, frequency: InstallmentFrequency): Date {
  if (index === 0) return new Date(base.getTime());
  if (frequency === "biweekly") {
    const next = new Date(base.getTime());
    next.setUTCDate(next.getUTCDate() + 14 * index);
    return next;
  }
  // monthly: keep the same day-of-month, clamping when the target month is
  // shorter (Jan 31 -> Feb 28/29 -> Mar 31).
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + index;
  const day = base.getUTCDate();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getUTCDate() !== day) {
    // overflowed into the next month -> back up to last day of intended month
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return candidate;
}

// ─── validateReferralSplitsSumTo100 ─────────────────────────────────────────

/**
 * Checks that an enrollment's referral split percentages sum to exactly 100
 * (with cent-level tolerance). An empty array returns `true` — "no referrals"
 * is valid; the caller decides whether commissions are required at all.
 */
export function validateReferralSplitsSumTo100(splits: Numeric[]): boolean {
  if (splits.length === 0) return true;
  const sum = splits.reduce<number>((acc, value) => acc + toNumber(value), 0);
  return Math.abs(sum - 100) <= MONEY_EPSILON;
}

// ─── canSellProductToStudent ────────────────────────────────────────────────

/**
 * Decides whether a new enrollment can be opened for (student, product).
 *
 * `existingActiveEnrollmentCount` is the count of non-terminal enrollments the
 * student already has for this product (ACTIVE or PAUSED — see
 * isActiveEnrollmentStatus). The caller passes the count from the DB; this
 * helper stays pure.
 */
export function canSellProductToStudent(
  saleLimit: ProductSaleLimit,
  existingActiveEnrollmentCount: number,
): boolean {
  if (existingActiveEnrollmentCount < 0) return false;
  if (saleLimit === "UNLIMITED") return true;
  return existingActiveEnrollmentCount === 0;
}

/** Enrollments that should block a re-sale under ONE_PER_STUDENT. */
export function isActiveEnrollmentStatus(status: EnrollmentStatus): boolean {
  return status === "ACTIVE" || status === "PAUSED";
}

// ─── shouldGenerateCommission ───────────────────────────────────────────────

export interface PaymentForCommission {
  isInitialPayment: boolean;
  initialPaymentType?: InitialPaymentType | null;
}

/**
 * Commissions are generated on the *initial* payment of a referred
 * enrollment. RESERVATION payments don't trigger commission on their own —
 * the reservation later converts (or refunds) and the converting payment is
 * what carries the commission base. FULL_PAYMENT and DOWN_PAYMENT both
 * trigger.
 */
export function shouldGenerateCommission(
  payment: PaymentForCommission,
  hasReferral: boolean,
): boolean {
  if (!hasReferral) return false;
  if (!payment.isInitialPayment) return false;
  return (
    payment.initialPaymentType === "FULL_PAYMENT" ||
    payment.initialPaymentType === "DOWN_PAYMENT"
  );
}

// ─── deriveDefaultCommissionBaseFromInitialPayment ──────────────────────────

export interface InitialPaymentForCommissionBase {
  isInitialPayment: boolean;
  initialPaymentType?: InitialPaymentType | null;
  officialAmountUsd?: Numeric | null;
  amount: Numeric;
  currency?: string | null;
}

/**
 * Default commissionable USD base for the initial payment of a referred
 * enrollment. Returns 0 when the payment isn't commission-eligible. Always
 * prefers `officialAmountUsd`; falls back to `amount` only when currency is
 * USD. The result is what `commissionBaseUsd` defaults to on each
 * EnrollmentReferralCommission row before the operator (optionally) overrides
 * it.
 */
export function deriveDefaultCommissionBaseFromInitialPayment(
  payment: InitialPaymentForCommissionBase | null | undefined,
): number {
  if (!payment) return 0;
  if (!shouldGenerateCommission(payment, true)) return 0;
  if (payment.officialAmountUsd !== null && payment.officialAmountUsd !== undefined) {
    const value = toNumber(payment.officialAmountUsd);
    return value > 0 ? round2(value) : 0;
  }
  const currency = (payment.currency ?? "USD").toUpperCase();
  if (currency !== "USD") return 0;
  const value = toNumber(payment.amount);
  return value > 0 ? round2(value) : 0;
}

// ─── getAutomaticTagNames ───────────────────────────────────────────────────

export interface StudentLifecycleForTags {
  status: StudentLifecycleStatus;
  mentorshipStatus: MentorshipStatus;
  accessStatus: AccessStatus;
}

/**
 * The set of automatic tag names the system should ensure are attached to a
 * student given the student's current lifecycle. Manual tag assignments are
 * not the concern of this helper; the reconciliation job adds these and
 * removes the ones no longer applicable.
 *
 * Returned in a stable, deterministic order so the output can be diffed.
 */
export function getAutomaticTagNames(student: StudentLifecycleForTags): string[] {
  const names: string[] = [];

  switch (student.status) {
    case "COMPLETED":
      names.push("Graduados");
      break;
    case "DROPPED":
      names.push("Bajas");
      break;
    case "PAUSED":
      names.push("Pausados");
      break;
    case "EXTENDED":
      names.push("Extendidos");
      break;
    case "ACCESS_REVOKED":
      names.push("Acceso revocado");
      break;
    case "SEPARATED":
      names.push("Separados");
      break;
    case "INACTIVE":
      names.push("Inactivos");
      break;
    case "WITHDRAWN":
      names.push("Retirados");
      break;
    case "ACTIVE":
      // no lifecycle-level tag for active students
      break;
  }

  if (student.mentorshipStatus === "PAUSED") {
    names.push("Mentoría pausada");
  } else if (student.mentorshipStatus === "FINISHED") {
    names.push("Mentoría finalizada");
  } else if (student.mentorshipStatus === "NOT_STARTED") {
    names.push("Mentoría no iniciada");
  }

  if (student.accessStatus === "REVOKED" && student.status !== "ACCESS_REVOKED") {
    names.push("Acceso revocado");
  } else if (student.accessStatus === "SUSPENDED") {
    names.push("Acceso suspendido");
  } else if (student.accessStatus === "PENDING") {
    names.push("Acceso pendiente");
  } else if (student.accessStatus === "SYNC_ERROR") {
    names.push("Error de sincronización LW");
  }

  return Array.from(new Set(names));
}
