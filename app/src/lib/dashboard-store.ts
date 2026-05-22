// RDS-backed dashboard store. Replaces the Supabase PostgREST client for the
// four whitelisted dashboard tables (kpi_data, daily_entries, ads_entries,
// daily_closer), which now live on RDS so the server-side dashboard works inside
// App Runner's VPC.
//
// All identifiers come from the whitelist (see dashboard-sql.ts) and all row
// values are bound as query parameters — never interpolated — so the surface is
// injection-safe. Prisma is imported lazily so callers that run without a
// configured database don't construct a client at import time.

import {
  isDashboardTable,
  sanitizeValues,
  type DashboardTable,
} from "./dashboard-tables";
import {
  buildDeleteSql,
  buildInsertSql,
  buildSelectSql,
  buildUpsertSql,
  conflictColumnsFor,
  coerceInputValue,
  columnKind,
  normalizeRow,
  prepareValues,
  quoteIdent,
} from "./dashboard-sql";

type Row = Record<string, unknown>;

/** Mirrors SupabaseRestError so route error mapping stays uniform. */
export class DashboardStoreError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DashboardStoreError";
  }
}

async function db() {
  const { prisma } = await import("./prisma");
  return prisma;
}

/** Read a table, optionally filtered to a set of `member` values. */
export async function dashboardSelect(
  table: DashboardTable,
  members?: readonly string[],
): Promise<Row[]> {
  const prisma = await db();
  if (members && members.length > 0) {
    const sql = buildSelectSql(table, members.length);
    const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...members);
    return rows.map((r) => normalizeRow(table, r));
  }
  const rows = await prisma.$queryRawUnsafe<Row[]>(buildSelectSql(table));
  return rows.map((r) => normalizeRow(table, r));
}

/** Upsert (insert or merge on the table's natural-key conflict target). */
export async function dashboardUpsert(
  table: DashboardTable,
  values: Row,
): Promise<void> {
  const conflictColumns = conflictColumnsFor(table);
  if (conflictColumns.length === 0) {
    // ads_entries has no natural key; callers must use dashboardInsert.
    throw new DashboardStoreError("table-not-upsertable", 400);
  }
  const { columns, params } = prepareValues(table, values);
  if (columns.length === 0) throw new DashboardStoreError("empty-values", 400);
  const sql = buildUpsertSql(table, columns, conflictColumns);
  const prisma = await db();
  await prisma.$executeRawUnsafe(sql, ...params);
}

/** Insert a row and return the inserted representation (ads_entries needs its id). */
export async function dashboardInsert(
  table: DashboardTable,
  values: Row,
): Promise<Row[]> {
  const { columns, params } = prepareValues(table, values);
  if (columns.length === 0) throw new DashboardStoreError("empty-values", 400);
  const sql = buildInsertSql(table, columns);
  const prisma = await db();
  const rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params);
  return rows.map((r) => normalizeRow(table, r));
}

/** Delete rows matching equality filters. Refuses to run unfiltered. */
export async function dashboardDelete(
  table: DashboardTable,
  match: Record<string, string | number>,
): Promise<void> {
  const columns = Object.keys(match);
  if (columns.length === 0) throw new DashboardStoreError("refusing-unfiltered-delete", 400);
  const sql = buildDeleteSql(table, columns);
  const params = columns.map((c) => coerceInputValue(columnKind(table, c), match[c]));
  const prisma = await db();
  await prisma.$executeRawUnsafe(sql, ...params);
}

// ─── Backfill import ─────────────────────────────────────────────────────────

export type ImportTables = Partial<Record<DashboardTable, unknown>>;
export type ImportCounts = Partial<Record<DashboardTable, number>>;

const IMPORTABLE_TABLES: readonly DashboardTable[] = [
  "kpi_data",
  "daily_entries",
  "ads_entries",
  "daily_closer",
];

function coerceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

async function importKeyedTable(table: DashboardTable, rows: unknown[]): Promise<number> {
  const conflictColumns = conflictColumnsFor(table);
  const prisma = await db();
  let count = 0;
  for (const raw of rows) {
    const values = sanitizeValues(table, raw);
    // Skip rows missing any natural-key column — they cannot be upserted safely.
    if (conflictColumns.some((c) => values[c] === undefined || values[c] === null)) continue;
    const { columns, params } = prepareValues(table, values);
    if (columns.length === 0) continue;
    const sql = buildUpsertSql(table, columns, conflictColumns);
    await prisma.$executeRawUnsafe(sql, ...params);
    count++;
  }
  return count;
}

async function importAdsTable(rows: unknown[]): Promise<number> {
  const table: DashboardTable = "ads_entries";
  const prisma = await db();
  let count = 0;
  let withId = 0;
  for (const raw of rows) {
    const values = sanitizeValues(table, raw);
    const id = coerceId((raw as Row | null | undefined)?.["id"]);
    if (id !== null) {
      // Idempotent re-import: preserve the original id and merge on it.
      const withIdValues: Row = { ...values, id };
      const { columns, params } = prepareValues(table, withIdValues, { allowId: true });
      const sql = buildUpsertSql(table, columns, ["id"], { allowId: true });
      await prisma.$executeRawUnsafe(sql, ...params);
      withId++;
    } else {
      const { columns, params } = prepareValues(table, values);
      if (columns.length === 0) continue;
      await prisma.$executeRawUnsafe(buildInsertSql(table, columns), ...params);
    }
    count++;
  }
  // Re-align the serial sequence so future browser inserts don't collide with
  // explicitly-imported ids.
  if (withId > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('ads_entries','id'), (SELECT MAX(id) FROM ${quoteIdent(
        "ads_entries",
      )}))`,
    );
  }
  return count;
}

/**
 * Backfill the dashboard tables from an export payload. Each table's rows are
 * sanitized through the whitelist before being upserted. Returns only per-table
 * counts (never row data).
 */
export async function dashboardImport(tables: ImportTables): Promise<ImportCounts> {
  const counts: ImportCounts = {};
  for (const table of IMPORTABLE_TABLES) {
    const rows = tables[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new DashboardStoreError(`invalid-rows:${table}`, 400);
    counts[table] = table === "ads_entries"
      ? await importAdsTable(rows)
      : await importKeyedTable(table, rows);
  }
  return counts;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface TableHealth {
  ok: boolean;
  rows?: number;
  error?: string;
}

/** Confirm a dashboard table exists and is readable on RDS. */
export async function checkDashboardTable(table: string): Promise<TableHealth> {
  if (!isDashboardTable(table)) return { ok: false, error: "not-a-dashboard-table" };
  try {
    const prisma = await db();
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT 1 AS ok FROM ${quoteIdent(table)} LIMIT 1`,
    );
    return { ok: true, rows: rows.length };
  } catch {
    return { ok: false, error: "rds-table-unreadable" };
  }
}
