#!/usr/bin/env node
// Import the read-only payments-lead-join truth file into the canonical
// DashboardPaymentTransaction ledger used by the Cash Collected dashboard.
//
// RUN WITH tsx (this .mjs imports the TypeScript classifier so there is a single
// source of truth for the rules):
//   npm run payments:import            # upsert into the database
//   DRY_RUN=1 npm run payments:import  # classify + print totals, no database
//
// Source path: env TORRE_PAYMENTS_JOIN_PATH, else the default truth file.
//
// PRIVACY: this script prints only counts and aggregate totals. It never logs
// buyer names, emails, or transaction ids.
//
// IDEMPOTENT: each transaction upserts on (source, externalTransactionId). The
// source's own transaction id is used when present; otherwise a deterministic
// synthetic id is derived from stable fields so re-imports do not duplicate rows.
import fs from "node:fs";
import crypto from "node:crypto";

const LEGACY_PATH =
  "/home/ubuntu/proyectos/unlocked-dashboard/cloud-automation/payments-lead-join.json";
const IMAGE_SEED_PATH = "scripts/payment-transactions-seed.json";
const DEFAULT_PATH = fs.existsSync(IMAGE_SEED_PATH) ? IMAGE_SEED_PATH : LEGACY_PATH;
const DATA_PATH = process.env.TORRE_PAYMENTS_JOIN_PATH || DEFAULT_PATH;

const HIGH_TICKET_RESERVA_THRESHOLD = 450;
const OFFICIAL_SOURCES = new Set(["hotmart", "stripe"]);

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function classifySource(source) {
  const normalized = normalize(source);
  if (OFFICIAL_SOURCES.has(normalized)) {
    return { contributesToCash: true, reviewRequired: false, reviewReason: null };
  }
  return {
    contributesToCash: true,
    reviewRequired: true,
    reviewReason: normalized ? `Fuente no oficial: ${String(source ?? "").trim()}` : "Fuente desconocida",
  };
}

function classifyTicket({ buyerType, amountUsd, cumulativeBefore }) {
  const type = normalize(buyerType);
  if (type === "low_ticket") return "LOW_TICKET";
  if (type !== "high_ticket") return "UNKNOWN";
  return round2(cumulativeBefore + amountUsd) <= HIGH_TICKET_RESERVA_THRESHOLD
    ? "RESERVA"
    : "HIGH_TICKET";
}

function leadKey(payment, index) {
  const email = normalize(payment.leadEmail);
  if (email) return `email:${email}`;
  const name = normalize(payment.leadName);
  if (name) return `name:${name}`;
  return `row:${index}`;
}

function classifyPayments(payments) {
  const byLead = new Map();
  payments.forEach((payment, index) => {
    const key = leadKey(payment, index);
    const bucket = byLead.get(key) || [];
    bucket.push({ payment, index });
    byLead.set(key, bucket);
  });
  const result = new Array(payments.length);
  for (const bucket of byLead.values()) {
    bucket.sort((a, b) => {
      const ta = new Date(a.payment.paidAt).getTime();
      const tb = new Date(b.payment.paidAt).getTime();
      return ta === tb ? a.index - b.index : ta - tb;
    });
    let cumulative = 0;
    for (const { payment, index } of bucket) {
      const amountUsd = round2(Number(payment.amountUsd) || 0);
      const sourceInfo = classifySource(payment.source);
      const classification = classifyTicket({ buyerType: payment.buyerType, amountUsd, cumulativeBefore: cumulative });
      cumulative = round2(cumulative + amountUsd);
      result[index] = {
        ...payment,
        amountUsd,
        paidAt: new Date(payment.paidAt),
        classification,
        contributesToCash: sourceInfo.contributesToCash,
        reviewRequired: sourceInfo.reviewRequired,
        reviewReason: sourceInfo.reviewReason,
      };
    }
  }
  return result;
}

function summarize(transactions) {
  const out = {
    cashCollected: 0,
    lowTicket: 0,
    highTicket: 0,
    reservas: 0,
    reviewRequired: 0,
    counts: { total: transactions.length, lowTicket: 0, highTicket: 0, reservas: 0, reviewRequired: 0, unknown: 0 },
  };
  for (const tx of transactions) {
    if (tx.contributesToCash) out.cashCollected += tx.amountUsd;
    if (tx.reviewRequired) {
      out.reviewRequired += tx.amountUsd;
      out.counts.reviewRequired += 1;
    }
    if (tx.classification === "LOW_TICKET") { out.lowTicket += tx.amountUsd; out.counts.lowTicket += 1; }
    else if (tx.classification === "HIGH_TICKET") { out.highTicket += tx.amountUsd; out.counts.highTicket += 1; }
    else if (tx.classification === "RESERVA") { out.reservas += tx.amountUsd; out.counts.reservas += 1; }
    else out.counts.unknown += 1;
  }
  for (const key of ["cashCollected", "lowTicket", "highTicket", "reservas", "reviewRequired"]) out[key] = round2(out[key]);
  return out;
}
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

// Flatten one join row into raw payments — one per sale_item.
function rowToPayments(row) {
  const items = Array.isArray(row.sale_items) ? row.sale_items : [];
  return items.map((item) => ({
    leadEmail: row.email ?? null,
    leadName: row.name ?? null,
    amountUsd: Number(item.amount_usd) || 0,
    paidAt: item.dateTime,
    source: item.source ?? "",
    buyerType: row.buyer_type ?? null,
    product: item.product ?? null,
    offerName: item.offerName ?? null,
    paymentType: item.paymentType ?? null,
    currency: item.currency ?? null,
    amountOriginal: item.amount == null ? null : Number(item.amount) || 0,
    externalTransactionId: item.transaction ? String(item.transaction) : null,
  }));
}

// Stable upsert key. Real transaction id when present; otherwise a deterministic
// hash of source/email/date/amount/product so manual rows stay idempotent.
function dedupeId(tx) {
  if (tx.externalTransactionId) return tx.externalTransactionId;
  const basis = [
    tx.source,
    tx.leadEmail ?? "",
    tx.paidAt instanceof Date ? tx.paidAt.toISOString() : String(tx.paidAt),
    tx.amountUsd,
    tx.product ?? "",
  ].join("|");
  return "syn:" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function bySource(transactions) {
  const counts = {};
  for (const tx of transactions) {
    const key = tx.source || "(vacío)";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`[payments-import] data file not found: ${DATA_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) {
    throw new Error("[payments-import] unexpected file shape: no rows array");
  }

  const payments = rows.flatMap(rowToPayments);
  const classified = classifyPayments(payments);
  const totals = summarize(classified);

  console.log(
    `[payments-import] file rows=${rows.length} transactions=${classified.length}` +
      (DRY_RUN ? " (DRY RUN)" : ""),
  );
  console.log("[payments-import] sources:", JSON.stringify(bySource(classified)));
  console.log(
    "[payments-import] classification counts:",
    JSON.stringify({
      lowTicket: totals.counts.lowTicket,
      highTicket: totals.counts.highTicket,
      reservas: totals.counts.reservas,
      unknown: totals.counts.unknown,
      reviewRequired: totals.counts.reviewRequired,
    }),
  );
  console.log(
    "[payments-import] totals USD:",
    JSON.stringify({
      cashCollected: totals.cashCollected,
      lowTicket: totals.lowTicket,
      highTicket: totals.highTicket,
      reservas: totals.reservas,
      reviewRequired: totals.reviewRequired,
    }),
  );

  if (DRY_RUN) {
    console.log("[payments-import] dry run complete — no database writes");
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("[payments-import] DATABASE_URL not set (use DRY_RUN=1 to classify only)");
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const before = await prisma.dashboardPaymentTransaction.count();
    let upserted = 0;
    for (const tx of classified) {
      const externalTransactionId = dedupeId(tx);
      const data = {
        externalTransactionId,
        source: tx.source,
        paidAt: tx.paidAt,
        leadName: tx.leadName,
        leadEmail: tx.leadEmail,
        amountUsd: tx.amountUsd,
        amountOriginal: tx.amountOriginal,
        currency: tx.currency,
        product: tx.product,
        offerName: tx.offerName,
        paymentType: tx.paymentType,
        buyerType: tx.buyerType,
        classification: tx.classification,
        contributesToCash: tx.contributesToCash,
        reviewRequired: tx.reviewRequired,
        reviewReason: tx.reviewReason,
      };
      await prisma.dashboardPaymentTransaction.upsert({
        where: {
          source_externalTransactionId: { source: tx.source, externalTransactionId },
        },
        create: { ...data, importedAt: new Date() },
        update: { ...data, importedAt: new Date() },
      });
      upserted += 1;
    }
    const after = await prisma.dashboardPaymentTransaction.count();
    console.log(
      `[payments-import] completed upserted=${upserted} before=${before} after=${after}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[payments-import] failed:", error?.message || error);
  process.exit(1);
});
