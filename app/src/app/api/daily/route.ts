import { NextResponse } from "next/server";
import { getDailyMetrics } from "@/lib/daily-data";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DailyMetric is a company-wide aggregate (no per-member column), so it is only
// served to global users. Non-global users get an explicit scope-limited no-data
// response rather than aggregate numbers they shouldn't see.
export async function GET() {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const access = resolveDashboardAccess(result.actor);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sin permiso de lectura" }, { status: 403 });
  }

  if (!access.isGlobalData) {
    return NextResponse.json({
      mode: "no-data",
      source: "torre-postgres",
      freshness: "unknown",
      lastSyncAt: null,
      rowCount: 0,
      rows: [],
      reason: "scope-limited",
    });
  }

  const data = await getDailyMetrics();
  return NextResponse.json(data);
}
