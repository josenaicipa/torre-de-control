import { NextResponse } from "next/server";
import { checkDashboardTable } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; error?: string };

function withoutRows(check: Check & { rows?: number }): Check {
  return check.ok ? { ok: true } : { ok: false, error: check.error ?? "unavailable" };
}

async function checkDatabase(): Promise<Check> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "database-url-missing" };
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, error: "database-unreachable" };
  }
}

export async function GET() {
  const [database, kpiData, dailyEntries, adsEntries, dailyCloser] = await Promise.all([
    checkDatabase(),
    checkDashboardTable("kpi_data"),
    checkDashboardTable("daily_entries"),
    checkDashboardTable("ads_entries"),
    checkDashboardTable("daily_closer"),
  ]);

  const dashboardTables = {
    kpi_data: withoutRows(kpiData),
    daily_entries: withoutRows(dailyEntries),
    ads_entries: withoutRows(adsEntries),
    daily_closer: withoutRows(dailyCloser),
  };
  const ok = database.ok && Object.values(dashboardTables).every((check) => check.ok);

  return NextResponse.json({ ok, database, dashboardTables, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
