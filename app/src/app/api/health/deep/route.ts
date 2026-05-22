import { NextResponse } from "next/server";
import { restSelect, SupabaseRestError } from "@/lib/supabase-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { ok: boolean; status?: number; rows?: number; error?: string };

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

async function checkTable(table: string): Promise<Check> {
  try {
    const rows = await restSelect(table, "select=*&limit=1");
    return { ok: true, rows: rows.length };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof SupabaseRestError ? error.status : 500,
      error: "supabase-rest-unreachable",
    };
  }
}

export async function GET() {
  const [database, kpiData, dailyEntries, adsEntries, dailyCloser] = await Promise.all([
    checkDatabase(),
    checkTable("kpi_data"),
    checkTable("daily_entries"),
    checkTable("ads_entries"),
    checkTable("daily_closer"),
  ]);

  const supabase = { kpi_data: kpiData, daily_entries: dailyEntries, ads_entries: adsEntries, daily_closer: dailyCloser };
  const ok = database.ok && Object.values(supabase).every((check) => check.ok);

  return NextResponse.json({ ok, database, supabase, time: new Date().toISOString() }, { status: ok ? 200 : 503 });
}
