import { dashboardUpsert } from "./dashboard-store";

export const DEFAULT_AD_SPEND_ENDPOINT =
  "https://metrics.unlockedecom.co/api/jarvis-metrics/dashboard/ad-spend-daily";
export const AUTO_ADS_MEMBER = "Auto Ads";
export const AUTO_ADS_DAILY_START_DATE = "2026-05-22";

type RawAdSpendRow = {
  date?: unknown;
  spend?: unknown;
  funnel?: unknown;
  channel?: unknown;
};

export type AutoAdsDailyEntry = {
  date: string;
  member: typeof AUTO_ADS_MEMBER;
  ig_followers: 0;
  posts: 0;
  mensajes: 0;
  follow_ups: 0;
  bk_offers: 0;
  gasto_meta: number;
  gasto_google: number;
  gasto_tiktok: 0;
  gasto_otros: 0;
};

function money(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function extractDailyTotals(payload: unknown): RawAdSpendRow[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const root = payload as Record<string, unknown>;
  const nested = root.ad_spend_daily;
  const nestedRows = nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>).daily_totals
    : undefined;
  const directRows = root.daily_totals;
  const rows = Array.isArray(nestedRows) ? nestedRows : Array.isArray(directRows) ? directRows : [];
  return rows.filter((row): row is RawAdSpendRow => Boolean(row && typeof row === "object"));
}

export function buildAutoAdsRows(payload: unknown): AutoAdsDailyEntry[] {
  const byDate = new Map<string, { meta: number; google: number }>();

  for (const row of extractDailyTotals(payload)) {
    const date = typeof row.date === "string" ? row.date : "";
    const funnel = typeof row.funnel === "string" ? row.funnel.toLowerCase() : "";
    const channel = typeof row.channel === "string" ? row.channel.toLowerCase() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < AUTO_ADS_DAILY_START_DATE) continue;
    if (funnel !== "high_ticket") continue;
    if (channel !== "meta" && channel !== "google") continue;

    const current = byDate.get(date) ?? { meta: 0, google: 0 };
    current[channel] += money(row.spend);
    byDate.set(date, current);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      member: AUTO_ADS_MEMBER,
      ig_followers: 0,
      posts: 0,
      mensajes: 0,
      follow_ups: 0,
      bk_offers: 0,
      gasto_meta: Math.round(values.meta * 100) / 100,
      gasto_google: Math.round(values.google * 100) / 100,
      gasto_tiktok: 0,
      gasto_otros: 0,
    }));
}

export async function syncAutoAdsFromMetrics(endpoint = process.env.TORRE_AD_SPEND_METRICS_URL || DEFAULT_AD_SPEND_ENDPOINT) {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ad-spend-source-http-${response.status}`);
  }

  const payload: unknown = await response.json();
  const rows = buildAutoAdsRows(payload);
  for (const row of rows) {
    await dashboardUpsert("daily_entries", row);
  }

  return {
    rows: rows.length,
    firstDate: rows[0]?.date ?? null,
    lastDate: rows.at(-1)?.date ?? null,
    totalMeta: Math.round(rows.reduce((sum, row) => sum + row.gasto_meta, 0) * 100) / 100,
    totalGoogle: Math.round(rows.reduce((sum, row) => sum + row.gasto_google, 0) * 100) / 100,
    member: AUTO_ADS_MEMBER,
  };
}
