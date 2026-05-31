// Pure SQL builders and value coercion for the RDS-backed dashboard store.
//
// SAFETY CONTRACT (do not weaken):
//   - Table and column identifiers may ONLY come from the dashboard whitelist
//     (DASHBOARD_TABLES). Every identifier is re-validated here and quoted, so a
//     malformed name can never reach the database.
//   - Row VALUES are never interpolated into SQL text. Builders emit positional
//     placeholders ($1, $2, …); the store binds values as query parameters.
//
// This module performs no I/O and constructs no Prisma client, so it is fully
// unit-testable in isolation. The store (dashboard-store.ts) layers Prisma
// execution on top of these builders.

import { Prisma } from "@prisma/client";
import {
  DASHBOARD_TABLES,
  conflictTarget,
  type DashboardTable,
} from "./dashboard-tables";

/** How a column maps to JS for binding (write) and serialization (read). */
export type ColumnKind = "number" | "date" | "text";

// Date-only columns: serialized to "YYYY-MM-DD" on read so the browser keeps
// using row.date / row.fecha as plain string keys (PostgREST returned strings).
const DATE_COLUMNS: Readonly<Record<DashboardTable, readonly string[]>> = {
  kpi_data: [],
  daily_entries: ["date"],
  ads_entries: ["fecha"],
  daily_closer: ["date"],
};

// Free-text columns. Everything else in the whitelist (and the ads surrogate
// `id`) is treated as a number.
const TEXT_COLUMNS: Readonly<Record<DashboardTable, readonly string[]>> = {
  kpi_data: [],
  daily_entries: ["member", "showup_notes", "hot_leads_evidence", "blockers", "setter_findings"],
  ads_entries: ["canal"],
  daily_closer: [],
};

/** Classify a column for coercion/serialization. Unknown columns default to number. */
export function columnKind(table: DashboardTable, column: string): ColumnKind {
  if (DATE_COLUMNS[table].includes(column)) return "date";
  if (TEXT_COLUMNS[table].includes(column)) return "text";
  return "number";
}

/** ads_entries is the only table with a surrogate `id` the browser reads/deletes by. */
function hasSurrogateId(table: DashboardTable): boolean {
  return table === "ads_entries";
}

/**
 * Is `column` a legal identifier for this table? Always limited to the table's
 * whitelist; `id` is additionally allowed for ads_entries (read/delete/import).
 */
export function isValidColumn(
  table: DashboardTable,
  column: string,
  opts: { allowId?: boolean } = {},
): boolean {
  if (opts.allowId && hasSurrogateId(table) && column === "id") return true;
  return (DASHBOARD_TABLES[table].columns as readonly string[]).includes(column);
}

function assertColumns(
  table: DashboardTable,
  columns: readonly string[],
  opts: { allowId?: boolean } = {},
): void {
  for (const column of columns) {
    if (!isValidColumn(table, column, opts)) {
      throw new Error(`invalid-column:${table}`);
    }
  }
}

// Defense in depth: even whitelisted names are checked against a strict pattern
// before being quoted, so nothing odd can ever be emitted as an identifier.
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error("invalid-identifier");
  }
  return `"${name}"`;
}

function placeholderFor(table: DashboardTable, column: string, position: number): string {
  return columnKind(table, column) === "date" ? `$${position}::date` : `$${position}`;
}

/** Coerce a JS value for binding to a column of the given kind. */
export function coerceInputValue(kind: ColumnKind, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (kind === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "bigint") return Number(value);
    if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  if (kind === "date") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return null;
  }
  // text
  return typeof value === "string" ? value : String(value);
}

/** Serialize a DB value back to the JSON shape the browser expects. */
export function normalizeOutputValue(kind: ColumnKind, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    // All Date-typed dashboard columns are date-only.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "bigint") return Number(value);
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (kind === "number" && typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

/** Normalize a full row read from the database (column kinds inferred per key). */
export function normalizeRow(
  table: DashboardTable,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = normalizeOutputValue(columnKind(table, key), value);
  }
  return out;
}

/**
 * Map an already-sanitized values object to ordered columns + bound params.
 * Validates every column against the whitelist (defense in depth) and coerces
 * each value for its column kind.
 */
export function prepareValues(
  table: DashboardTable,
  values: Record<string, unknown>,
  opts: { allowId?: boolean } = {},
): { columns: string[]; params: unknown[] } {
  const columns = Object.keys(values);
  assertColumns(table, columns, opts);
  const params = columns.map((c) => coerceInputValue(columnKind(table, c), values[c]));
  return { columns, params };
}

/** SELECT *, optionally filtered to a set of `member` values (daily_entries). */
export function buildSelectSql(table: DashboardTable, memberCount = 0): string {
  const t = quoteIdent(table);
  if (memberCount > 0) {
    const placeholders = Array.from({ length: memberCount }, (_, i) => `$${i + 1}`).join(", ");
    return `SELECT * FROM ${t} WHERE ${quoteIdent("member")} IN (${placeholders})`;
  }
  return `SELECT * FROM ${t}`;
}

/**
 * INSERT … ON CONFLICT (target) DO UPDATE — mirrors PostgREST merge-duplicates.
 * Only the non-conflict columns are updated, so partial upserts touch exactly
 * the fields the caller sent. Falls back to DO NOTHING when only the conflict
 * columns are present.
 */
export function buildUpsertSql(
  table: DashboardTable,
  columns: readonly string[],
  conflictColumns: readonly string[],
  opts: { allowId?: boolean } = {},
): string {
  if (columns.length === 0) throw new Error("upsert-needs-columns");
  if (conflictColumns.length === 0) throw new Error("upsert-needs-conflict");
  assertColumns(table, columns, opts);
  assertColumns(table, conflictColumns, opts);

  const t = quoteIdent(table);
  const cols = columns.map(quoteIdent).join(", ");
  const placeholders = columns.map((column, i) => placeholderFor(table, column, i + 1)).join(", ");
  const conflict = conflictColumns.map(quoteIdent).join(", ");
  const updateCols = columns.filter((c) => !conflictColumns.includes(c));

  const conflictClause =
    updateCols.length === 0
      ? `ON CONFLICT (${conflict}) DO NOTHING`
      : `ON CONFLICT (${conflict}) DO UPDATE SET ${updateCols
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
          .join(", ")}`;

  return `INSERT INTO ${t} (${cols}) VALUES (${placeholders}) ${conflictClause}`;
}

/** INSERT … RETURNING * — used for ads_entries so the new id flows back. */
export function buildInsertSql(table: DashboardTable, columns: readonly string[]): string {
  if (columns.length === 0) throw new Error("insert-needs-columns");
  assertColumns(table, columns);
  const t = quoteIdent(table);
  const cols = columns.map(quoteIdent).join(", ");
  const placeholders = columns.map((column, i) => placeholderFor(table, column, i + 1)).join(", ");
  return `INSERT INTO ${t} (${cols}) VALUES (${placeholders}) RETURNING *`;
}

/** DELETE … WHERE col = $n AND … — refuses to build with no filters. */
export function buildDeleteSql(table: DashboardTable, columns: readonly string[]): string {
  if (columns.length === 0) throw new Error("refusing-unfiltered-delete");
  assertColumns(table, columns, { allowId: true });
  const t = quoteIdent(table);
  const where = columns.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(" AND ");
  return `DELETE FROM ${t} WHERE ${where}`;
}

/**
 * Resolve the upsert conflict columns for a table. kpi_data/daily_entries/
 * daily_closer have natural keys; ads_entries has none (insert-only) but can
 * upsert on `id` during import to stay idempotent.
 */
export function conflictColumnsFor(table: DashboardTable): string[] {
  const target = conflictTarget(table);
  return target ? target.split(",") : [];
}
