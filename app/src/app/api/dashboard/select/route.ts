import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { isDashboardTable } from "@/lib/dashboard-tables";
import { dashboardSelect, DashboardStoreError } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/select?table=<whitelisted table>
// Reads one dashboard table for any active dashboard reader. Jose's operational
// rule for the Torre/Detalle surface is intentionally broad on reads: every
// logged-in user with dashboard.read must be able to see the saved Detalle data
// the team filled in. Mutations remain scoped in /api/dashboard/mutate.
export async function GET(req: NextRequest) {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const access = resolveDashboardAccess(result.actor);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sin permiso de lectura" }, { status: 403 });
  }

  const table = req.nextUrl.searchParams.get("table");
  if (!isDashboardTable(table)) {
    return NextResponse.json({ error: "Tabla no permitida" }, { status: 400 });
  }

  try {
    const rows = await dashboardSelect(table);
    return NextResponse.json({ rows, scopeLimited: false, readScope: "all-dashboard-readers" });
  } catch (error) {
    const upstreamStatus = error instanceof DashboardStoreError ? error.status : undefined;
    console.error("dashboard.select.failed", { table, upstreamStatus });
    const status = error instanceof DashboardStoreError ? 400 : 500;
    return NextResponse.json({ error: `Error de datos (${table})` }, { status });
  }
}
