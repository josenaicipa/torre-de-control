import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { isDashboardTable, tableConfig } from "@/lib/dashboard-tables";
import { dashboardSelect, DashboardStoreError } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dashboard/select?table=<whitelisted table>
// Reads one dashboard table, scope-filtered to what the active user may see.
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

  const config = tableConfig(table);

  // Aggregate tables have no per-member column: only global users may read them.
  if (config.scope === "aggregate" && !access.isGlobalData) {
    return NextResponse.json({ rows: [], scopeLimited: true, reason: access.reason });
  }

  // Member-scoped table: global users read everything; others get only their
  // allowed members. An empty allowed set means no rows (fail closed).
  let members: readonly string[] | undefined;
  if (config.scope === "member" && !access.isGlobalData) {
    if (access.allowedMembers.length === 0) {
      return NextResponse.json({ rows: [], scopeLimited: true, reason: access.reason });
    }
    members = access.allowedMembers;
  }

  try {
    const rows = await dashboardSelect(table, members);
    return NextResponse.json({ rows, scopeLimited: !access.isGlobalData });
  } catch (error) {
    const upstreamStatus = error instanceof DashboardStoreError ? error.status : undefined;
    console.error("dashboard.select.failed", { table, upstreamStatus });
    const status = error instanceof DashboardStoreError ? 400 : 500;
    return NextResponse.json({ error: `Error de datos (${table})` }, { status });
  }
}
