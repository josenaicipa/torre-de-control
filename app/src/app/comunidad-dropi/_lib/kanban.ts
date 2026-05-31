// Helpers for the secondary Kanban view of Seguimientos. The board is read
// alongside the operational queue, so it intentionally reuses the same query
// vocabulary (priority, reason, country, mine, etc.) but ignores the
// per-status / per-bucket filters that only make sense on the table.

export type KanbanStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export interface KanbanColumnDef {
  status: KanbanStatus;
  label: string;
  accent: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumnDef[] = [
  { status: "OPEN", label: "Abierto", accent: "#FCD34D" },
  { status: "IN_PROGRESS", label: "En curso", accent: "#7DD3FC" },
  { status: "DONE", label: "Hecho", accent: "#86EFAC" },
  { status: "DISMISSED", label: "Descartado", accent: "#CBD5E1" },
] as const;

export const KANBAN_STATUS_ORDER: KanbanStatus[] = KANBAN_COLUMNS.map(
  (c) => c.status,
);

const KANBAN_STATUS_SET: Set<string> = new Set(KANBAN_STATUS_ORDER);

// Bucket cards by their `status` field while preserving the input order so
// each column reflects whatever ordering the server applied. Unknown statuses
// are dropped rather than thrown so a future enum addition doesn't break the
// dashboard for managers until we wire a column.
export function groupByKanbanStatus<T extends { status: string }>(
  rows: T[],
): Record<KanbanStatus, T[]> {
  const out: Record<KanbanStatus, T[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    DONE: [],
    DISMISSED: [],
  };
  for (const row of rows) {
    if (KANBAN_STATUS_SET.has(row.status)) {
      out[row.status as KanbanStatus].push(row);
    }
  }
  return out;
}

// Subset of the table filters that the kanban honors. Status/bucket are
// deliberately excluded — the kanban is the place where all four status
// columns coexist, and date-bucket slicing is a queue concept.
export interface KanbanFilters {
  priority?: "P1" | "P2" | "P3" | "P4";
  reason?: string;
  q?: string;
  country?: string;
  assignedToId?: string;
  mine: boolean;
  unassigned: boolean;
}

export function parseKanbanFilters(
  sp: Record<string, string | undefined>,
): KanbanFilters {
  const priority =
    sp.priority === "P1" ||
    sp.priority === "P2" ||
    sp.priority === "P3" ||
    sp.priority === "P4"
      ? sp.priority
      : undefined;

  return {
    priority,
    reason: sp.reason?.trim() || undefined,
    q: sp.q?.trim() || undefined,
    country: sp.country?.trim() || undefined,
    assignedToId: sp.assignedToId?.trim() || undefined,
    mine: sp.mine === "1",
    unassigned: sp.unassigned === "1",
  };
}

// Mirror of `buildFollowUpsHref` for the kanban subset. Stays relative so the
// caller composes it with the page route. Overrides honor `null` to drop a key
// — useful for "limpiar filtros" affordances and for shared link builders that
// need to neutralize a stale value.
export function buildKanbanHref(
  filters: Partial<KanbanFilters>,
  overrides: Record<string, string | null | undefined> = {},
): string {
  const merged: Record<string, string | null | undefined> = {
    priority: filters.priority,
    reason: filters.reason,
    q: filters.q,
    country: filters.country,
    assignedToId: filters.assignedToId,
    mine: filters.mine ? "1" : undefined,
    unassigned: filters.unassigned ? "1" : undefined,
    ...overrides,
  };
  // Status and bucket are not kanban concepts. Strip them even if a caller
  // tried to pass them through.
  delete merged.status;
  delete merged.bucket;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}
