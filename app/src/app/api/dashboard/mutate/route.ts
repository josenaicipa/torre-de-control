import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { writeAudit } from "@/lib/audit";
import {
  auditTargetForDashboardMutation,
  buildDashboardMutationAuditMetadata,
  findDashboardExistingRow,
  shouldAuditDashboardMutation,
} from "@/lib/dashboard-audit";
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
import type { DashboardActor } from "@/lib/dashboard-access";
import {
  dashboardDelete,
  dashboardInsert,
  dashboardSelect,
  dashboardUpsert,
  recomputeCommercialCloserAggregate,
  DashboardStoreError,
} from "@/lib/dashboard-store";
import { shouldRecomputeCommercialCloser } from "@/lib/commercial-closer-aggregate";

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

async function previousDashboardAuditRow(
  table: DashboardTable,
  values: Record<string, unknown>,
  members?: readonly string[],
): Promise<Record<string, unknown> | null> {
  if (!shouldAuditDashboardMutation("upsert", table)) return null;
  const rows = await dashboardSelect(table, members);
  return findDashboardExistingRow(table, rows, values);
}

async function writeDashboardMutationAudit(
  op: MutateOp,
  table: DashboardTable,
  values: Record<string, unknown>,
  actorId: string,
  actor: DashboardActor,
  previousRow: Record<string, unknown> | null,
): Promise<void> {
  if (!shouldAuditDashboardMutation(op, table)) return;
  await writeAudit({
    actorId,
    action: `dashboard.${table}.${op}`,
    target: auditTargetForDashboardMutation(table, values),
    metadata: buildDashboardMutationAuditMetadata({
      op,
      table,
      values,
      previousRow,
      actor,
    }),
  });
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

type AggregateSyncResult = "recomputed" | "skipped" | "deferred";

// After an authorized daily_entries upsert/delete, derive the high-ticket
// commercial aggregate (daily_closer) server-side. This replaces the legacy
// browser-side daily_closer upsert that a scoped closer was (correctly) forbidden
// from making — it keeps the aggregate fresh WITHOUT granting the user a direct
// aggregate write. A recompute failure must not fail the user's own report save:
// the primary daily_entries write already succeeded and the derive is idempotent
// (it self-heals on the next save), so we log and report it as deferred.
async function syncCommercialCloserAfterEntryWrite(
  table: DashboardTable,
  record: Record<string, unknown>,
): Promise<AggregateSyncResult> {
  if (table !== "daily_entries") return "skipped";
  const date = typeof record.date === "string" ? record.date : null;
  const member = typeof record.member === "string" ? record.member : null;
  if (!date || !member) return "skipped";
  if (!shouldRecomputeCommercialCloser(member, date)) return "skipped";
  try {
    const recomputed = await recomputeCommercialCloserAggregate(date);
    return recomputed ? "recomputed" : "skipped";
  } catch (error) {
    console.error("dashboard.daily_closer.recompute_failed", {
      date,
      status: error instanceof DashboardStoreError ? error.status : "unknown",
    });
    return "deferred";
  }
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
      const auditMembers = memberScoped && !access.isGlobalData && "member" in match ? [String(match.member)] : undefined;
      const previousRow = await previousDashboardAuditRow(table, match, auditMembers);
      await dashboardDelete(table, match);
      await writeDashboardMutationAudit(body.op, table, match, result.userId, result.actor, previousRow);
      const aggregate = await syncCommercialCloserAfterEntryWrite(table, match);
      return NextResponse.json({ ok: true, aggregate });
    }

    // upsert / insert
    if (!values || Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Datos vacíos" }, { status: 400 });
    }

    if (memberScoped && !access.isGlobalData && !isMemberAllowed(access, values.member) && !ownDailyEntryFill) {
      return FORBIDDEN;
    }

    const auditMembers = memberScoped && !access.isGlobalData && values.member ? [String(values.member)] : undefined;
    const previousRow = await previousDashboardAuditRow(table, values, auditMembers);

    if (body.op === "upsert") {
      await dashboardUpsert(table, values);
      await writeDashboardMutationAudit(body.op, table, values, result.userId, result.actor, previousRow);
      const aggregate = await syncCommercialCloserAfterEntryWrite(table, values);
      return NextResponse.json({ ok: true, aggregate });
    }

    // insert returns the inserted row(s) (ads_entries needs the new id)
    const rows = await dashboardInsert(table, values);
    await writeDashboardMutationAudit(body.op, table, values, result.userId, result.actor, previousRow);
    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const status = error instanceof DashboardStoreError ? error.status : 500;
    return NextResponse.json({ error: "Error de datos" }, { status });
  }
}
