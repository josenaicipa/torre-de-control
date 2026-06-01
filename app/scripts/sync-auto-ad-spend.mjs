#!/usr/bin/env node
// Sync Jarvis/Metrics ad spend into dashboard daily_entries as member "Auto Ads".
// This is intentionally idempotent: (date, member) is the natural key and each
// run refreshes the latest Meta/Google spend while leaving human-entered rows
// untouched.
import { PrismaClient } from "@prisma/client";

const DEFAULT_ENDPOINT = "https://metrics.unlockedecom.co/api/jarvis-metrics/dashboard/ad-spend-daily";
const ENDPOINT = process.env.TORRE_AD_SPEND_METRICS_URL || DEFAULT_ENDPOINT;
const MEMBER = "Auto Ads";

function money(value) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dailyTotals(payload) {
  const nested = payload?.ad_spend_daily?.daily_totals;
  const direct = payload?.daily_totals;
  return Array.isArray(nested) ? nested : Array.isArray(direct) ? direct : [];
}

function buildRows(payload) {
  const byDate = new Map();
  for (const row of dailyTotals(payload)) {
    const date = typeof row?.date === "string" ? row.date : "";
    const funnel = typeof row?.funnel === "string" ? row.funnel.toLowerCase() : "";
    const channel = typeof row?.channel === "string" ? row.channel.toLowerCase() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (funnel !== "high_ticket") continue;
    if (channel !== "meta" && channel !== "google") continue;
    const current = byDate.get(date) ?? { meta: 0, google: 0 };
    current[channel] += money(row.spend);
    byDate.set(date, current);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({
    date,
    gasto_meta: Math.round(values.meta * 100) / 100,
    gasto_google: Math.round(values.google * 100) / 100,
  }));
}

async function main() {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  if (!response.ok) throw new Error(`metrics HTTP ${response.status}`);
  const rows = buildRows(await response.json());
  const prisma = new PrismaClient();
  try {
    for (const row of rows) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "daily_entries"
          ("date", "member", "ig_followers", "posts", "mensajes", "follow_ups", "bk_offers", "gasto_meta", "gasto_google", "gasto_tiktok", "gasto_otros")
         VALUES ($1::date, $2, 0, 0, 0, 0, 0, $3, $4, 0, 0)
         ON CONFLICT ("date", "member") DO UPDATE SET
          "ig_followers" = EXCLUDED."ig_followers",
          "posts" = EXCLUDED."posts",
          "mensajes" = EXCLUDED."mensajes",
          "follow_ups" = EXCLUDED."follow_ups",
          "bk_offers" = EXCLUDED."bk_offers",
          "gasto_meta" = EXCLUDED."gasto_meta",
          "gasto_google" = EXCLUDED."gasto_google",
          "gasto_tiktok" = EXCLUDED."gasto_tiktok",
          "gasto_otros" = EXCLUDED."gasto_otros"`,
        row.date,
        MEMBER,
        row.gasto_meta,
        row.gasto_google,
      );
    }
    const summary = {
      rows: rows.length,
      firstDate: rows[0]?.date ?? null,
      lastDate: rows.at(-1)?.date ?? null,
      totalMeta: Math.round(rows.reduce((sum, row) => sum + row.gasto_meta, 0) * 100) / 100,
      totalGoogle: Math.round(rows.reduce((sum, row) => sum + row.gasto_google, 0) * 100) / 100,
      member: MEMBER,
    };
    console.log("[sync-auto-ad-spend] completed", JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[sync-auto-ad-spend] failed", error?.message || error);
  process.exit(1);
});
