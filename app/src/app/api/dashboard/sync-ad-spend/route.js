import { NextResponse } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { syncAutoAdsFromMetrics } from "@/lib/ad-spend-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/dashboard/sync-ad-spend
// Pulls the latest Jarvis/Metrics ad-spend export server-side and upserts it
// into daily_entries as member "Auto Ads", preserving the historical dashboard
// contract used by Detalle Diario while removing the stale manual JSON step.
export async function POST() {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const access = resolveDashboardAccess(result.actor);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sin permiso de lectura" }, { status: 403 });
  }

  try {
    const summary = await syncAutoAdsFromMetrics();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("dashboard.sync-ad-spend.failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "No se pudo sincronizar gasto publicitario" }, { status: 502 });
  }
}
