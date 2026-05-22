import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { isMemberAllowed, resolveDashboardAccess } from "@/lib/dashboard-access";
import {
  conflictTarget,
  isDashboardTable,
  sanitizeValues,
  tableConfig,
  type DashboardTable,
} from "@/lib/dashboard-tables";
import { restDelete, restInsert, restUpsert, SupabaseRestError } from "@/lib/supabase-rest";

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
  if (!access.canWrite) {
    return NextResponse.json({ error: "Sin permiso de escritura" }, { status: 403 });
  }

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
      await restDelete(table, match);
      return NextResponse.json({ ok: true });
    }

    // upsert / insert
    const values = sanitizeValues(table, body.values);
    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Datos vacíos" }, { status: 400 });
    }

    if (memberScoped && !access.isGlobalData && !isMemberAllowed(access, values.member)) {
      return FORBIDDEN;
    }

    if (body.op === "upsert") {
      await restUpsert(table, values, conflictTarget(table));
      return NextResponse.json({ ok: true });
    }

    // insert returns the inserted row(s) (ads_entries needs the new id)
    const rows = await restInsert(table, values);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const status = error instanceof SupabaseRestError ? 502 : 500;
    return NextResponse.json({ error: "Error de datos" }, { status });
  }
}
