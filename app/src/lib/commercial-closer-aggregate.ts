// Server-side derivation of the commercial high-ticket closer daily aggregate
// (`daily_closer`) from the per-collaborator `daily_entries` rows.
//
// WHY THIS EXISTS — RBAC-safe aggregate sync:
//   The legacy dashboard let the browser write `daily_closer` directly right
//   after a collaborator saved their own `daily_entries` row. `daily_closer` is
//   an *aggregate* table (no `member` column), so `/api/dashboard/mutate`
//   correctly forbids aggregate writes for non-global users. A scoped closer
//   (e.g. Daryi Perez — position CLOSER / DataScope OWN) could save their own
//   `daily_entries` row, but the follow-up `daily_closer` upsert returned
//   HTTP 403, surfacing the alert
//   "Guardado en colaborador, pero no se pudo actualizar el total diario: HTTP 403".
//
//   Fix (do NOT weaken RBAC): the *server* derives `daily_closer` from
//   `daily_entries` after an already-authorized `daily_entries` upsert/delete.
//   The scoped user never writes the aggregate directly — the route still blocks
//   that (fail-closed). The server recomputes the aggregate deterministically
//   from the rows it already governs.
//
// This module is pure and deterministic so it can be fully unit-tested without a
// database or network. The collaborator catalog and field mapping mirror the
// legacy dashboard (public/index.html: CLOSER_COLLABORATORS, rowToEntry,
// syncCommercialCloserAggregate).

/** Closer collaborators, mirrored from public/index.html `CLOSER_COLLABORATORS`. */
interface CloserCollaborator {
  readonly id: string;
  readonly legacy?: string;
}

const CLOSER_COLLABORATORS: readonly CloserCollaborator[] = [
  { id: "Carlos Velez", legacy: "Carlos" },
  { id: "Daryi Perez", legacy: "Daryi" },
  { id: "Wiston Quintero", legacy: "Juan Diego Afanador" },
  { id: "Daniel Garcia Closer", legacy: "Daniel Garcia" },
  { id: "Alejandro Gallo Closer", legacy: "Alejandro Gallo" },
];

// Active setter rows that share display names with closer profiles. These must
// never be canonicalized into the closer aggregate.
const ACTIVE_SETTER_MEMBER_IDS: ReadonlySet<string> = new Set([
  "Alejandro Gallo",
  "Daniel Garcia",
  "Luisa Vega",
  "Lucas Soria",
  "Karen Setter",
]);

const ADMIN_MEMBER_ID = "Admin";

/** Canonical closer ids (the `member` value `saveEntry` persists). */
const HIGH_TICKET_CLOSER_MEMBER_IDS: ReadonlySet<string> = new Set(
  CLOSER_COLLABORATORS.map((c) => c.id),
);

/** Commercial *reporting* ids = Admin + canonical closers (priority-period set). */
const COMMERCIAL_REPORTING_MEMBER_IDS: ReadonlySet<string> = new Set([
  ADMIN_MEMBER_ID,
  ...CLOSER_COLLABORATORS.map((c) => c.id),
]);

/** Commercial ids incl. legacy aliases (pre-priority-period set). */
const COMMERCIAL_MEMBER_IDS: ReadonlySet<string> = new Set([
  ADMIN_MEMBER_ID,
  ...CLOSER_COLLABORATORS.flatMap((c) =>
    c.legacy && !ACTIVE_SETTER_MEMBER_IDS.has(c.legacy) ? [c.id, c.legacy] : [c.id],
  ),
]);

/** Legacy → canonical member id. Mirrors public/index.html `closerCanonId`. */
export function closerCanonId(member: string): string {
  if (!member) return member;
  if (ACTIVE_SETTER_MEMBER_IDS.has(member)) return member;
  const match = CLOSER_COLLABORATORS.find((c) => c.legacy === member);
  return match ? match.id : member;
}

function isAdminMember(member: string): boolean {
  return member === ADMIN_MEMBER_ID;
}

/**
 * Date from which the per-collaborator "Área Comercial" report is the official
 * source for the commercial aggregate. Before this date the legacy `daily_closer`
 * row is managed manually and must NOT be derived/overwritten. Mirrors
 * public/index.html `AREA_COMERCIAL_PRIORITY_START`.
 */
export const AREA_COMERCIAL_PRIORITY_START = "2026-06-01";

export function areaComercialHasPriority(date: string): boolean {
  return date >= AREA_COMERCIAL_PRIORITY_START;
}

function isJune2026(date: string): boolean {
  return date >= "2026-06-01" && date <= "2026-06-30";
}

function isCommercialReportingMember(member: string, date: string): boolean {
  return areaComercialHasPriority(date)
    ? COMMERCIAL_REPORTING_MEMBER_IDS.has(member)
    : COMMERCIAL_MEMBER_IDS.has(member);
}

/**
 * Does this canonical member report into the high-ticket closer aggregate on
 * this date? Mirrors public/index.html `isHighTicketCloserReportingMember`.
 */
export function isHighTicketCloserReportingMember(member: string, date: string): boolean {
  return isJune2026(date)
    ? HIGH_TICKET_CLOSER_MEMBER_IDS.has(member)
    : isCommercialReportingMember(member, date) && !isAdminMember(member);
}

/**
 * Should a `daily_entries` write for (member, date) trigger a server-side
 * `daily_closer` recompute? True only inside the commercial-priority period for a
 * high-ticket closer reporting member. The `member` may be a legacy alias; it is
 * canonicalized here.
 */
export function shouldRecomputeCommercialCloser(member: string, date: string): boolean {
  if (!areaComercialHasPriority(date)) return false;
  return isHighTicketCloserReportingMember(closerCanonId(member), date);
}

/** Raw `daily_entries` row shape (snake_case columns) relevant to the aggregate. */
export interface DailyEntryRow {
  readonly date?: unknown;
  readonly member?: unknown;
  readonly sales_organic?: unknown;
  readonly revenue_organic?: unknown;
  readonly cash_organic?: unknown;
  readonly recurring_organic?: unknown;
  readonly [key: string]: unknown;
}

/** Partial `daily_closer` payload the recompute persists (5 derived columns). */
export interface CommercialCloserAggregate {
  readonly date: string;
  readonly q_ventas_ht: number;
  readonly valor_venta_ht: number;
  readonly upfront_cash_ht: number;
  readonly ventas_cash: number;
  readonly recurring_cash: number;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Derive the high-ticket commercial aggregate for `date` from all
 * `daily_entries` rows. Returns `null` when the date is outside the
 * commercial-priority period (the legacy aggregate is manual there and must not
 * be overwritten).
 *
 * Column mapping mirrors public/index.html `rowToEntry` + the legacy
 * `syncCommercialCloserAggregate`:
 *   ventasHT      → sales_organic     → q_ventas_ht
 *   valorVentaHT  → revenue_organic   → valor_venta_ht
 *   upfrontCash   → cash_organic      → upfront_cash_ht
 *   cashCollected → cash_organic      → ventas_cash  (legacy: cashCollected || upfrontCash)
 *   recurringCash → recurring_organic → recurring_cash
 * Only these 5 columns are written; a partial upsert on `date` preserves every
 * other `daily_closer` column (manual LT/refund/agenda fields stay intact).
 */
export function deriveCommercialCloserAggregate(
  date: string,
  rows: readonly DailyEntryRow[],
): CommercialCloserAggregate | null {
  if (!areaComercialHasPriority(date)) return null;

  const dayRows = rows.filter(
    (r) =>
      String(r.date ?? "") === date &&
      isHighTicketCloserReportingMember(closerCanonId(String(r.member ?? "")), date),
  );

  const sum = (key: keyof DailyEntryRow): number =>
    dayRows.reduce((total, r) => total + num(r[key]), 0);

  // cashCollected and upfrontCash both persist into cash_organic, so the legacy
  // `cashCollected || upfrontCash` reduces to a single sum of cash_organic.
  const cash = sum("cash_organic");

  return {
    date,
    q_ventas_ht: sum("sales_organic"),
    valor_venta_ht: sum("revenue_organic"),
    upfront_cash_ht: cash,
    ventas_cash: cash,
    recurring_cash: sum("recurring_organic"),
  };
}
