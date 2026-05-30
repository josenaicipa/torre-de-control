// Helpers for the Seguimientos operational queue: bucket classification by
// due date, Spanish relative dates, and search-param utilities shared between
// the server page and the client table. Pure functions so the unit tests can
// pin behavior without hitting Prisma or React.

import { COLORS } from "./tokens";

export type DueBucket =
  | "OVERDUE"
  | "TODAY"
  | "THIS_WEEK"
  | "UPCOMING"
  | "NO_DATE";

export const BUCKET_ORDER: DueBucket[] = [
  "OVERDUE",
  "TODAY",
  "THIS_WEEK",
  "UPCOMING",
  "NO_DATE",
];

export const BUCKET_LABELS: Record<DueBucket, string> = {
  OVERDUE: "Vencidos",
  TODAY: "Para hoy",
  THIS_WEEK: "Esta semana",
  UPCOMING: "Próximos",
  NO_DATE: "Sin fecha",
};

export const BUCKET_COLORS: Record<
  DueBucket,
  { bg: string; border: string; text: string; rowAccent: string }
> = {
  OVERDUE: {
    bg: "#FEE2E2",
    border: "#FCA5A5",
    text: "#991B1B",
    rowAccent: "#FCA5A5",
  },
  TODAY: {
    bg: "#FEF3C7",
    border: "#FCD34D",
    text: "#92400E",
    rowAccent: "#FCD34D",
  },
  THIS_WEEK: {
    bg: "#E0F2FE",
    border: "#7DD3FC",
    text: "#075985",
    rowAccent: "#7DD3FC",
  },
  UPCOMING: {
    bg: "#F1F5F9",
    border: "#CBD5E1",
    text: "#475569",
    rowAccent: "#CBD5E1",
  },
  NO_DATE: {
    bg: COLORS.background,
    border: COLORS.border,
    text: COLORS.textSoft,
    rowAccent: COLORS.border,
  },
};

// Treat days as calendar days in UTC to match how dueDate is stored when the
// `<input type="date">` PATCH path serializes the value (midnight UTC for the
// chosen calendar day). Keeping the math in UTC avoids the "off by one" flips
// teams hit when the server timezone drifts from the user's.
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function diffInCalendarDays(target: Date, reference: Date): number {
  const a = startOfUtcDay(target).getTime();
  const b = startOfUtcDay(reference).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function getDueBucket(due: Date | string | null, now: Date): DueBucket {
  if (!due) return "NO_DATE";
  const dueDate = typeof due === "string" ? new Date(due) : due;
  if (Number.isNaN(dueDate.getTime())) return "NO_DATE";
  const delta = diffInCalendarDays(dueDate, now);
  if (delta < 0) return "OVERDUE";
  if (delta === 0) return "TODAY";
  if (delta <= 7) return "THIS_WEEK";
  return "UPCOMING";
}

export function formatRelativeDateEs(
  value: Date | string | null,
  now: Date,
): string {
  if (!value) return "Sin fecha";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  const delta = diffInCalendarDays(d, now);
  if (delta === 0) return "hoy";
  if (delta === 1) return "mañana";
  if (delta === -1) return "ayer";
  if (delta > 1) return `en ${delta} días`;
  return `hace ${Math.abs(delta)} días`;
}

// Locale-aware date for tooltip / detailed display.
export function formatLongDateEs(value: Date | string | null): string {
  if (!value) return "Sin fecha";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Search params parsing shared by the page and the URL builders. Centralizing
// avoids drift between the KPI banner links, the filter form, and the bucket
// query that the server uses to fetch rows.
export interface FollowUpsFilters {
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED" | "OPEN_AND_PROGRESS";
  priority?: "P1" | "P2" | "P3" | "P4";
  reason?: string;
  q?: string;
  country?: string;
  assignedToId?: string;
  mine: boolean;
  unassigned: boolean;
  bucket?: DueBucket;
  untouched: boolean;
  page: number;
}

export function parseFollowUpsFilters(sp: Record<string, string | undefined>): FollowUpsFilters {
  const rawStatus = sp.status ?? "";
  const status =
    rawStatus === "OPEN" ||
    rawStatus === "IN_PROGRESS" ||
    rawStatus === "DONE" ||
    rawStatus === "DISMISSED"
      ? rawStatus
      : "OPEN_AND_PROGRESS";

  const priority =
    sp.priority === "P1" ||
    sp.priority === "P2" ||
    sp.priority === "P3" ||
    sp.priority === "P4"
      ? sp.priority
      : undefined;

  const bucket =
    sp.bucket === "OVERDUE" ||
    sp.bucket === "TODAY" ||
    sp.bucket === "THIS_WEEK" ||
    sp.bucket === "UPCOMING" ||
    sp.bucket === "NO_DATE"
      ? sp.bucket
      : undefined;

  return {
    status,
    priority,
    reason: sp.reason?.trim() || undefined,
    q: sp.q?.trim() || undefined,
    country: sp.country?.trim() || undefined,
    assignedToId: sp.assignedToId?.trim() || undefined,
    mine: sp.mine === "1",
    unassigned: sp.unassigned === "1",
    bucket,
    untouched: sp.untouched === "1",
    page: Math.max(1, parseInt(sp.page ?? "1", 10) || 1),
  };
}

// Serialize a partial filter set back to a query string. Use overrides to nuke
// specific keys (set them to undefined) or to add new ones (e.g. KPI links).
export function buildFollowUpsHref(
  filters: Partial<FollowUpsFilters>,
  overrides: Record<string, string | null | undefined> = {},
): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined | null> = {
    status:
      filters.status && filters.status !== "OPEN_AND_PROGRESS"
        ? filters.status
        : undefined,
    priority: filters.priority,
    reason: filters.reason,
    q: filters.q,
    country: filters.country,
    assignedToId: filters.assignedToId,
    mine: filters.mine ? "1" : undefined,
    unassigned: filters.unassigned ? "1" : undefined,
    bucket: filters.bucket,
    untouched: filters.untouched ? "1" : undefined,
    page:
      filters.page && filters.page > 1 ? String(filters.page) : undefined,
    ...overrides,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

// Build a fresh filter set that keeps no prior selections so the KPI banner
// always behaves like a reset + focused query.
export function kpiHref(
  preset: Record<string, string | null | undefined>,
): string {
  return buildFollowUpsHref({}, preset);
}

// Used by the table to know which rows fall in each bucket. Keeps the bucket
// header rendering free of per-row date math.
export function groupByBucket<T extends { dueDate: string | null }>(
  rows: T[],
  now: Date,
): Record<DueBucket, T[]> {
  const out: Record<DueBucket, T[]> = {
    OVERDUE: [],
    TODAY: [],
    THIS_WEEK: [],
    UPCOMING: [],
    NO_DATE: [],
  };
  for (const row of rows) {
    out[getDueBucket(row.dueDate, now)].push(row);
  }
  return out;
}
