// Read side of the Cash Collected feature. Loads the precomputed, classified
// payment ledger (DashboardPaymentTransaction) for one month and shapes it for
// the dashboard: headline totals plus drill-down lists grouped by metric.
//
// Classification, contributesToCash and reviewRequired are decided at import time
// by src/domain/cash-collected.ts; here we only filter by month, convert Prisma
// Decimals to numbers, and reuse the pure `summarize` so the totals match the
// import-time logic exactly.

import {
  summarize,
  type CashSummary,
  type ClassifiedTransaction,
  type Classification,
} from "@/domain/cash-collected";

// Fields the UI drill-down actually needs. Deliberately excludes the raw payload.
export interface PaymentTransactionView {
  readonly leadName: string | null;
  readonly leadEmail: string | null;
  readonly amountUsd: number;
  readonly paidAt: string; // ISO 8601
  readonly source: string;
  readonly product: string | null;
  readonly classification: string;
  readonly reviewRequired: boolean;
  readonly reviewReason: string | null;
  readonly paymentType: string | null;
  readonly currency: string | null;
}

export interface MonthlyCashSummary {
  readonly year: number;
  readonly month: number; // 1-12
  readonly totals: CashSummary;
  // Drill-down lists. Each is an overlapping view of the same transactions.
  readonly groups: {
    readonly cashCollected: PaymentTransactionView[];
    readonly lowTicket: PaymentTransactionView[];
    readonly highTicket: PaymentTransactionView[];
    readonly reservas: PaymentTransactionView[];
    readonly reviewRequired: PaymentTransactionView[];
  };
}

// Shape Prisma returns for the columns we select (Decimal -> Prisma.Decimal).
interface TxRow {
  leadName: string | null;
  leadEmail: string | null;
  amountUsd: { toString(): string };
  amountOriginal: { toString(): string } | null;
  paidAt: Date;
  source: string;
  product: string | null;
  offerName: string | null;
  paymentType: string | null;
  currency: string | null;
  buyerType: string | null;
  classification: string;
  contributesToCash: boolean;
  reviewRequired: boolean;
  reviewReason: string | null;
}

function toNumber(value: { toString(): string } | null): number | null {
  if (value == null) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

function toClassified(row: TxRow): ClassifiedTransaction {
  return {
    leadEmail: row.leadEmail,
    leadName: row.leadName,
    amountUsd: toNumber(row.amountUsd) ?? 0,
    paidAt: row.paidAt,
    source: row.source,
    product: row.product,
    offerName: row.offerName,
    paymentType: row.paymentType,
    currency: row.currency,
    amountOriginal: toNumber(row.amountOriginal),
    externalTransactionId: null,
    buyerType: row.buyerType,
    classification: row.classification as Classification,
    contributesToCash: row.contributesToCash,
    reviewRequired: row.reviewRequired,
    reviewReason: row.reviewReason,
  };
}

function toView(tx: ClassifiedTransaction): PaymentTransactionView {
  return {
    leadName: tx.leadName,
    leadEmail: tx.leadEmail,
    amountUsd: tx.amountUsd,
    paidAt: tx.paidAt.toISOString(),
    source: tx.source,
    product: tx.product,
    classification: tx.classification,
    reviewRequired: tx.reviewRequired,
    reviewReason: tx.reviewReason,
    paymentType: tx.paymentType,
    currency: tx.currency,
  };
}

/**
 * Load and summarize one month of payment transactions. `month` is 1-12.
 * Returns null when no database is configured so callers can fail closed.
 */
export async function getMonthlyCashSummary(
  year: number,
  month: number,
): Promise<MonthlyCashSummary | null> {
  if (!process.env.DATABASE_URL) return null;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const { prisma } = await import("@/lib/prisma");
  const rows = (await prisma.dashboardPaymentTransaction.findMany({
    where: { paidAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { paidAt: "desc" },
    select: {
      leadName: true,
      leadEmail: true,
      amountUsd: true,
      amountOriginal: true,
      paidAt: true,
      source: true,
      product: true,
      offerName: true,
      paymentType: true,
      currency: true,
      buyerType: true,
      classification: true,
      contributesToCash: true,
      reviewRequired: true,
      reviewReason: true,
    },
  })) as TxRow[];

  const classified = rows.map(toClassified);
  const totals = summarize(classified);

  const groups = {
    cashCollected: classified.filter((t) => t.contributesToCash).map(toView),
    lowTicket: classified.filter((t) => t.classification === "LOW_TICKET").map(toView),
    highTicket: classified.filter((t) => t.classification === "HIGH_TICKET").map(toView),
    reservas: classified.filter((t) => t.classification === "RESERVA").map(toView),
    reviewRequired: classified.filter((t) => t.reviewRequired).map(toView),
  };

  return { year, month, totals, groups };
}
