// Helpers puros para resumir los totales financieros de un estudiante en USD
// canónico, y para detectar si todavía está "Pendiente por iniciar". Se
// extraen aparte de los componentes React para poder testearlos sin DOM.

type Numeric = string | number | null | undefined;

export interface PaymentLike {
  amount: Numeric;
  currency: string;
  officialAmountUsd?: Numeric;
}

export interface EnrollmentTotalsLike {
  totalAmountUsd: Numeric;
  balanceUsd?: Numeric;
}

export interface PendingHeuristicEnrollment {
  accessStatus: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "SYNC_ERROR" | string;
  payments: { initialPaymentType: string | null }[];
}

export interface StudentFinanceTotals {
  totalUsd: number;
  paidUsd: number;
  balanceUsd: number;
}

function toNum(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Valor USD canónico de un pago. Si trae officialAmountUsd lo usamos; si no y
// la moneda es USD, el propio amount; cualquier otro caso devuelve 0 porque
// no tenemos forma de convertir a USD sin TRM.
export function paymentUsdValue(payment: PaymentLike): number {
  if (payment.officialAmountUsd != null && payment.officialAmountUsd !== "") {
    return toNum(payment.officialAmountUsd);
  }
  if ((payment.currency ?? "").toUpperCase() === "USD") {
    return toNum(payment.amount);
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeStudentFinanceTotals(
  enrollments: EnrollmentTotalsLike[],
  payments: PaymentLike[],
): StudentFinanceTotals {
  const totalUsd = round2(
    enrollments.reduce((sum, e) => sum + toNum(e.totalAmountUsd), 0),
  );
  const paidUsd = round2(
    payments.reduce((sum, p) => sum + paymentUsdValue(p), 0),
  );
  const hasAnyBalance = enrollments.some((e) => e.balanceUsd != null && e.balanceUsd !== "");
  const balanceUsd = hasAnyBalance
    ? round2(enrollments.reduce((sum, e) => sum + toNum(e.balanceUsd), 0))
    : round2(Math.max(0, totalUsd - paidUsd));
  return { totalUsd, paidUsd, balanceUsd };
}

// Un estudiante se considera "Pendiente por iniciar" sólo si hay señal explícita
// de que aún no arrancó: enrollment con accessStatus PENDING sin ningún ACTIVE, o
// pago inicial RESERVATION sin acceso ACTIVO. Si no hay enrollments registrados
// (caso legacy) devolvemos false y se respetan las fechas reales del estudiante.
export function isStudentPending(enrollments: PendingHeuristicEnrollment[]): boolean {
  if (enrollments.length === 0) return false;
  const hasActiveAccess = enrollments.some((e) => e.accessStatus === "ACTIVE");
  if (hasActiveAccess) return false;
  const hasPendingAccess = enrollments.some((e) => e.accessStatus === "PENDING");
  const hasReservationPayment = enrollments.some((e) =>
    e.payments.some((p) => p.initialPaymentType === "RESERVATION"),
  );
  return hasPendingAccess || hasReservationPayment;
}
