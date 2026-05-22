/**
 * Cash Collected domain classifier.
 *
 * Pure, deterministic functions — no database, no network, no clock — so the
 * rules can be fully unit-tested and reused by both the import script and the
 * API. This module is the single source of truth for how a raw payment becomes a
 * classified transaction.
 *
 * Two independent axes are decided here:
 *
 *  1. SOURCE TRUST (classifySource): Hotmart and Stripe are official sources we
 *     trust. Anything else (Manual, unknown, ...) still counts toward cash but is
 *     flagged reviewRequired so a human validates it ("Pago a revisar").
 *
 *  2. TICKET CLASSIFICATION (classifyTicket / classifyPayments): low-ticket
 *     payments are always LOW_TICKET. For a high-ticket lead, payments stay
 *     RESERVA while the lead's *cumulative* paid amount is <= 450 USD; the payment
 *     that pushes the cumulative strictly above 450 is the HIGH_TICKET sale, and
 *     every payment after the lead has crossed 450 is HIGH_TICKET too. The
 *     threshold uses `> 450` (not `>=`), matching the legacy dashboard.
 *
 * Amounts are USD numbers (the threshold is in USD). Cash totals include every
 * payment that contributesToCash, regardless of classification — reservas are
 * money received and count toward Cash Collected even though they are surfaced
 * separately in the UI.
 */

export type Classification = "LOW_TICKET" | "RESERVA" | "HIGH_TICKET" | "UNKNOWN";

/** Cumulative-USD threshold a high-ticket lead must cross to stop being reserva. */
export const HIGH_TICKET_RESERVA_THRESHOLD = 450;

/** Sources we treat as official truth (lowercased for comparison). */
export const OFFICIAL_SOURCES: readonly string[] = ["hotmart", "stripe"];

export interface RawPayment {
  readonly leadEmail: string | null;
  readonly leadName?: string | null;
  /** Amount in USD. Drives the reserva threshold and every cash total. */
  readonly amountUsd: number;
  readonly paidAt: Date | string;
  readonly source: string;
  /** "low_ticket" | "high_ticket" (other values resolve to UNKNOWN). */
  readonly buyerType: string | null;
  readonly product?: string | null;
  readonly offerName?: string | null;
  readonly paymentType?: string | null;
  readonly currency?: string | null;
  readonly amountOriginal?: number | null;
  readonly externalTransactionId?: string | null;
}

export interface SourceClassification {
  readonly contributesToCash: boolean;
  readonly reviewRequired: boolean;
  readonly reviewReason: string | null;
}

export interface ClassifiedTransaction {
  readonly leadEmail: string | null;
  readonly leadName: string | null;
  readonly amountUsd: number;
  readonly paidAt: Date;
  readonly source: string;
  readonly product: string | null;
  readonly offerName: string | null;
  readonly paymentType: string | null;
  readonly currency: string | null;
  readonly amountOriginal: number | null;
  readonly externalTransactionId: string | null;
  readonly buyerType: string | null;
  readonly classification: Classification;
  readonly contributesToCash: boolean;
  readonly reviewRequired: boolean;
  readonly reviewReason: string | null;
}

export interface CashSummary {
  readonly cashCollected: number;
  readonly lowTicket: number;
  readonly highTicket: number;
  readonly reservas: number;
  readonly reviewRequired: number;
  readonly counts: {
    readonly total: number;
    readonly lowTicket: number;
    readonly highTicket: number;
    readonly reservas: number;
    readonly reviewRequired: number;
    readonly unknown: number;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Decide whether a payment counts toward cash and whether a human must review it.
 * Official sources (Hotmart, Stripe) are trusted; everything else contributes to
 * cash but is flagged "Pago a revisar".
 */
export function classifySource(source: string | null | undefined): SourceClassification {
  const normalized = normalize(source);
  if (OFFICIAL_SOURCES.includes(normalized)) {
    return { contributesToCash: true, reviewRequired: false, reviewReason: null };
  }
  return {
    contributesToCash: true,
    reviewRequired: true,
    reviewReason: normalized
      ? `Fuente no oficial: ${(source ?? "").trim()}`
      : "Fuente desconocida",
  };
}

/**
 * Classify a single payment by ticket type given how much the lead had already
 * paid before this payment (cumulativeBefore, USD). Low-ticket leads are always
 * LOW_TICKET. High-ticket leads stay RESERVA until the cumulative crosses 450.
 */
export function classifyTicket(params: {
  buyerType: string | null;
  amountUsd: number;
  cumulativeBefore: number;
}): Classification {
  const buyerType = normalize(params.buyerType);
  if (buyerType === "low_ticket") return "LOW_TICKET";
  if (buyerType !== "high_ticket") return "UNKNOWN";

  const cumulativeAfter = round2(params.cumulativeBefore + params.amountUsd);
  // Still within the reservation window: money is held as a reserva.
  if (cumulativeAfter <= HIGH_TICKET_RESERVA_THRESHOLD) return "RESERVA";
  // This payment crossed (or is beyond) the threshold: it's a high-ticket sale.
  return "HIGH_TICKET";
}

function leadKey(payment: RawPayment, index: number): string {
  const email = normalize(payment.leadEmail);
  if (email) return `email:${email}`;
  const name = normalize(payment.leadName);
  if (name) return `name:${name}`;
  // No identity to group by: treat as its own lead so its cumulative starts at 0.
  return `row:${index}`;
}

/**
 * Classify a batch of raw payments. Payments are grouped per lead and processed
 * in chronological order so the cumulative reservation rule is applied correctly
 * across a lead's full history. The returned list preserves the input order.
 */
export function classifyPayments(payments: readonly RawPayment[]): ClassifiedTransaction[] {
  // Stable chronological order per lead: sort by paidAt, breaking ties on the
  // original index so equal timestamps keep their input ordering.
  const indexed = payments.map((payment, index) => ({ payment, index }));
  const byLead = new Map<string, { payment: RawPayment; index: number }[]>();
  for (const entry of indexed) {
    const key = leadKey(entry.payment, entry.index);
    const bucket = byLead.get(key);
    if (bucket) bucket.push(entry);
    else byLead.set(key, [entry]);
  }

  // result indexed by original position so output order matches input order.
  const result = new Array<ClassifiedTransaction>(payments.length);

  for (const bucket of byLead.values()) {
    bucket.sort((a, b) => {
      const ta = toDate(a.payment.paidAt).getTime();
      const tb = toDate(b.payment.paidAt).getTime();
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    });

    let cumulative = 0;
    for (const { payment, index } of bucket) {
      const amountUsd = round2(Number(payment.amountUsd) || 0);
      const classification = classifyTicket({
        buyerType: payment.buyerType,
        amountUsd,
        cumulativeBefore: cumulative,
      });
      cumulative = round2(cumulative + amountUsd);

      const sourceInfo = classifySource(payment.source);

      result[index] = {
        leadEmail: payment.leadEmail ?? null,
        leadName: payment.leadName ?? null,
        amountUsd,
        paidAt: toDate(payment.paidAt),
        source: (payment.source ?? "").trim(),
        product: payment.product ?? null,
        offerName: payment.offerName ?? null,
        paymentType: payment.paymentType ?? null,
        currency: payment.currency ?? null,
        amountOriginal:
          payment.amountOriginal == null ? null : round2(Number(payment.amountOriginal) || 0),
        externalTransactionId: payment.externalTransactionId ?? null,
        buyerType: payment.buyerType ?? null,
        classification,
        contributesToCash: sourceInfo.contributesToCash,
        reviewRequired: sourceInfo.reviewRequired,
        reviewReason: sourceInfo.reviewReason,
      };
    }
  }

  return result;
}

/**
 * Sum classified transactions into the headline metrics. Cash Collected is every
 * payment that contributesToCash; the ticket buckets and the review bucket are
 * overlapping views of the same transactions.
 */
export function summarize(transactions: readonly ClassifiedTransaction[]): CashSummary {
  let cashCollected = 0;
  let lowTicket = 0;
  let highTicket = 0;
  let reservas = 0;
  let reviewRequired = 0;
  let cLow = 0;
  let cHigh = 0;
  let cReserva = 0;
  let cReview = 0;
  let cUnknown = 0;

  for (const tx of transactions) {
    if (tx.contributesToCash) cashCollected += tx.amountUsd;
    if (tx.reviewRequired) {
      reviewRequired += tx.amountUsd;
      cReview += 1;
    }
    switch (tx.classification) {
      case "LOW_TICKET":
        lowTicket += tx.amountUsd;
        cLow += 1;
        break;
      case "HIGH_TICKET":
        highTicket += tx.amountUsd;
        cHigh += 1;
        break;
      case "RESERVA":
        reservas += tx.amountUsd;
        cReserva += 1;
        break;
      default:
        cUnknown += 1;
        break;
    }
  }

  return {
    cashCollected: round2(cashCollected),
    lowTicket: round2(lowTicket),
    highTicket: round2(highTicket),
    reservas: round2(reservas),
    reviewRequired: round2(reviewRequired),
    counts: {
      total: transactions.length,
      lowTicket: cLow,
      highTicket: cHigh,
      reservas: cReserva,
      reviewRequired: cReview,
      unknown: cUnknown,
    },
  };
}
