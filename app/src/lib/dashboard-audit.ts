import type { DashboardTable } from "./dashboard-tables";

type MutateOp = "upsert" | "insert" | "delete";

type Row = Record<string, unknown>;

interface AuditActorIdentity {
  readonly email: string;
  readonly name: string | null;
  readonly ghlUserName: string | null;
}

interface BuildAuditMetadataInput {
  readonly op: MutateOp;
  readonly table: DashboardTable;
  readonly values: Row;
  readonly previousRow?: Row | null;
  readonly actor: AuditActorIdentity;
}

const AUDITED_DAILY_TABLES = new Set<DashboardTable>(["daily_closer", "daily_entries"]);

export function shouldAuditDashboardMutation(op: MutateOp, table: DashboardTable): boolean {
  return AUDITED_DAILY_TABLES.has(table) && (op === "upsert" || op === "insert" || op === "delete");
}

function keyFor(table: DashboardTable, values: Row): Row {
  if (table === "daily_entries") {
    return { date: values.date, member: values.member };
  }
  if (table === "daily_closer") {
    return { date: values.date };
  }
  return {};
}

export function auditTargetForDashboardMutation(table: DashboardTable, values: Row): string {
  const key = keyFor(table, values);
  if (table === "daily_entries") return `${table}:${String(key.date ?? "unknown")}:${String(key.member ?? "unknown")}`;
  if (table === "daily_closer") return `${table}:${String(key.date ?? "unknown")}`;
  return table;
}

function sameValue(a: unknown, b: unknown): boolean {
  return String(a ?? "") === String(b ?? "");
}

export function findDashboardExistingRow(table: DashboardTable, rows: readonly Row[], values: Row): Row | null {
  const key = keyFor(table, values);
  if (table === "daily_entries") {
    return rows.find((row) => sameValue(row.date, key.date) && sameValue(row.member, key.member)) ?? null;
  }
  if (table === "daily_closer") {
    return rows.find((row) => sameValue(row.date, key.date)) ?? null;
  }
  return null;
}

export function buildDashboardMutationAuditMetadata(input: BuildAuditMetadataInput): Record<string, unknown> {
  const previousRow = input.previousRow ?? null;
  const changedFields = Object.keys(input.values).filter((field) => {
    if (field === "date" || field === "member") return false;
    if (!previousRow) return true;
    return !sameValue(previousRow[field], input.values[field]);
  });

  const previousValues: Row = {};
  const newValues: Row = {};
  for (const field of changedFields) {
    previousValues[field] = previousRow ? previousRow[field] : null;
    newValues[field] = input.values[field];
  }

  return {
    op: input.op,
    table: input.table,
    source: "dashboard_api",
    actor: {
      email: input.actor.email,
      name: input.actor.name,
      ghlUserName: input.actor.ghlUserName,
    },
    key: keyFor(input.table, input.values),
    changedFields,
    previousValues,
    newValues,
    payloadValues: input.values,
  };
}
