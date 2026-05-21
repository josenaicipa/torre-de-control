// Server-side reader for daily KPI metrics. The frontend reads through this,
// never directly from an external system. When the database is not configured
// or has no rows, we return an explicit no-data state — never fabricated numbers.

export interface DailyMetricRow {
  date: string;
  channel: string;
  spend: number;
  booked: number;
  showed: number;
  closed: number;
  revenue: number;
}

export type DailyMode = "data" | "no-data";

export interface DailyResponse {
  mode: DailyMode;
  source: string;
  freshness: "fresh" | "stale" | "unknown";
  lastSyncAt: string | null;
  rowCount: number;
  rows: DailyMetricRow[];
  reason?: string;
}

const STALE_AFTER_MS = 1000 * 60 * 60 * 36; // 36h without a newer row => stale

function noData(reason: string): DailyResponse {
  return {
    mode: "no-data",
    source: "torre-postgres",
    freshness: "unknown",
    lastSyncAt: null,
    rowCount: 0,
    rows: [],
    reason,
  };
}

// Pure transformation: deterministic, DB-free, unit-testable.
export function buildDailyResponse(
  rows: DailyMetricRow[],
  lastSyncAt: string | null = null,
  now: number = Date.now(),
): DailyResponse {
  if (!rows || rows.length === 0) {
    return noData("empty");
  }
  let freshness: DailyResponse["freshness"] = "unknown";
  if (lastSyncAt) {
    const age = now - new Date(lastSyncAt).getTime();
    freshness = age <= STALE_AFTER_MS ? "fresh" : "stale";
  }
  return {
    mode: "data",
    source: "torre-postgres",
    freshness,
    lastSyncAt,
    rowCount: rows.length,
    rows,
  };
}

export async function getDailyMetrics(take = 30): Promise<DailyResponse> {
  if (!process.env.DATABASE_URL) {
    return noData("db-not-configured");
  }
  try {
    // Lazy import so PrismaClient is only constructed when a DB is configured.
    const { prisma } = await import("./prisma");
    const records = await prisma.dailyMetric.findMany({
      orderBy: { date: "desc" },
      take,
    });

    const rows: DailyMetricRow[] = records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      channel: r.channel,
      spend: Number(r.spend),
      booked: r.booked,
      showed: r.showed,
      closed: r.closed,
      revenue: Number(r.revenue),
    }));

    const lastSyncAt =
      records.length > 0
        ? records
            .map((r) => r.updatedAt.getTime())
            .reduce((a, b) => Math.max(a, b), 0)
        : null;

    return buildDailyResponse(
      rows,
      lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    );
  } catch {
    return noData("db-unavailable");
  }
}
