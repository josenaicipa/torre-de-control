import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor, type ActorResult } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { writeAudit } from "@/lib/audit";
import {
  buildDashboardMutationAuditMetadata,
  findDashboardExistingRow,
} from "@/lib/dashboard-audit";
import { dashboardImport, dashboardSelect, DashboardStoreError, type ImportTables } from "@/lib/dashboard-store";
import { sanitizeValues, type DashboardTable } from "@/lib/dashboard-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secret(): string | null {
  const value = process.env.AUTH_SECRET;
  return value && value.length >= 16 ? value : null;
}

function verifySignature(body: string, header: string | null): boolean {
  const key = secret();
  if (!key || !header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", key).update(body).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function canImportWithSession(result: ActorResult | null): boolean {
  if (!result) return false;
  const access = resolveDashboardAccess(result.actor);
  return access.isGlobalData && access.canWrite;
}

async function changedRowsForImport(table: DashboardTable, rawRows: unknown): Promise<Record<string, unknown>[]> {
  if (!Array.isArray(rawRows) || (table !== "daily_closer" && table !== "daily_entries")) return [];
  const existingRows = await dashboardSelect(table);
  return rawRows
    .map((raw) => {
      const values = sanitizeValues(table, raw);
      const previousRow = findDashboardExistingRow(table, existingRows, values);
      return buildDashboardMutationAuditMetadata({
        op: "upsert",
        table,
        values,
        previousRow,
        actor: {
          email: "system@torre-import",
          name: "Dashboard Import",
          ghlUserName: null,
        },
      });
    })
    .filter((row) => Array.isArray(row.changedFields) && row.changedFields.length > 0);
}

async function collectImportChangedRows(tables: ImportTables): Promise<{
  daily_closer: Record<string, unknown>[];
  daily_entries: Record<string, unknown>[];
}> {
  const [dailyCloserChanges, dailyEntryChanges] = await Promise.all([
    changedRowsForImport("daily_closer", tables.daily_closer),
    changedRowsForImport("daily_entries", tables.daily_entries),
  ]);
  return { daily_closer: dailyCloserChanges, daily_entries: dailyEntryChanges };
}

async function writeImportAudit(
  counts: Record<string, number | undefined>,
  signed: boolean,
  actorResult: ActorResult | null,
  changedRows: { daily_closer: Record<string, unknown>[]; daily_entries: Record<string, unknown>[] },
): Promise<void> {
  await writeAudit({
    actorId: actorResult?.userId ?? null,
    action: "dashboard.import",
    target: "dashboard_tables",
    metadata: {
      source: "dashboard_import_api",
      signed,
      actor: actorResult?.actor ?? null,
      counts,
      changedRows,
    },
  });
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const signed = verifySignature(bodyText, req.headers.get("x-torre-import-signature"));
  const actorResult = signed ? null : await getDashboardActor();
  const sessionAllowed = signed ? false : canImportWithSession(actorResult);
  if (!signed && !sessionAllowed) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const tables = (parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { tables?: unknown }).tables
    : null) as ImportTables | null;

  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  try {
    const changedRows = await collectImportChangedRows(tables);
    const counts = await dashboardImport(tables);
    await writeImportAudit(counts, signed, actorResult, changedRows);
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    const status = error instanceof DashboardStoreError ? error.status : 500;
    const safeMessage = error instanceof Error ? error.message.slice(0, 300) : "unknown";
    const safeCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : undefined;
    console.error("dashboard.import.failed", { status, safeCode, safeMessage });
    return NextResponse.json({ error: "Importación falló" }, { status });
  }
}
