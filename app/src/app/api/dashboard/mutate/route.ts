import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import {
  canReadDashboard,
  isMemberAllowed,
  isOwnDashboardEntryMember,
  resolveDashboardAccess,
} from "@/lib/dashboard-access";
import {
  isDashboardTable,
  sanitizeValues,
  tableConfig,
  type DashboardTable,
} from "@/lib/dashboard-tables";
import {
  dashboardDelete,
  dashboardInsert,
  dashboardUpsert,
  DashboardStoreError,
} from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MutateOp = "upsert" | "insert" | "delete";

const FORBIDDEN = NextResponse.json({ error: "Fuera de tu alcance" }, { status: 403 });

interface MutateBody {
  op?: unknown;
  table?: unknown;
  values?: unknown;
  match?: unknown;
}

function isOp(value: unknown): value is MutateOp {
  return value === "upsert" || value === "insert" || value === "delete";
}

// Delete filters are restricted to "id" plus the table's known columns, and
// values must be primitives. This blocks arbitrary or unfiltered deletes.
function sanitizeMatch(
  table: DashboardTable,
  input: unknown,
): Record<string, string | number> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const allowed = new Set<string>(["id", ...tableConfig(table).columns]);
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "string" || typeof value === "number") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function POST(req: NextRequest) {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const access = resolveDashboardAccess(result.actor);

  let body: MutateBody;
  try {
    body = (await req.json()) as MutateBody;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!isOp(body.op) || !isDashboardTable(body.table)) {
    return NextResponse.json({ error: "Operación no permitida" }, { status: 400 });
  }

  const table = body.table;
  const config = tableConfig(table);
  const memberScoped = config.scope === "member";
  const values = body.op === "upsert" || body.op === "insert"
    ? sanitizeValues(table, body.values)
    : null;
  const ownDailyEntryFill = body.op === "upsert"
    && table === "daily_entries"
    && values
    && isOwnDashboardEntryMember(result.actor, values.member)
    && canReadDashboard(result.actor);

  if (!access.canWrite && !ownDailyEntryFill) {
    return NextResponse.json({ error: "Sin permiso de escritura" }, { status: 403 });
  }

  // Aggregate tables (no member column) are global-only for any write.
  if (!memberScoped && !access.isGlobalData) {
    return FORBIDDEN;
  }

  try {
    if (body.op === "delete") {
      const match = sanitizeMatch(table, body.match);
      if (!match) {
        return NextResponse.json({ error: "Filtro de borrado inválido" }, { status: 400 });
      }
      // For member-scoped deletes, the member must be in the caller's set. We
      // also require the member key so a scoped user can't delete by id alone.
      if (memberScoped && !access.isGlobalData) {
        if (!("member" in match) || !isMemberAllowed(access, match.member)) {
          return FORBIDDEN;
        }
      }
      await dashboardDelete(table, match);
      return NextResponse.json({ ok: true });
    }

    // upsert / insert
    if (!values || Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Datos vacíos" }, { status: 400 });
    }

    if (memberScoped && !access.isGlobalData && !isMemberAllowed(access, values.member) && !ownDailyEntryFill) {
      return FORBIDDEN;
    }

    if (body.op === "upsert") {
      await dashboardUpsert(table, values);
      return NextResponse.json({ ok: true });
    }

    // insert returns the inserted row(s) (ads_entries needs the new id)
    const rows = await dashboardInsert(table, values);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const status = error instanceof DashboardStoreError ? error.status : 500;
    return NextResponse.json({ error: "Error de datos" }, { status });
  }
}
