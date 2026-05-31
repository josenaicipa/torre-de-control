// Adaptador puro para el "Pulso semanal disponible" del Pulso Comunidad Dropi.
//
// El cierre mensual sigue siendo el dato reina del Pulso; este helper deja
// expuesta la última ventana semanal confirmada (DropiWeeklyMetric) como
// dato parcial honesto. Es pura para que tests unitarios cubran totales,
// deltas y la edad de la ventana sin tocar Prisma ni Next.

export interface WeeklyPulseRow {
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  memberId?: string;
}

export interface WeeklyPulsePeriod {
  periodStart: Date;
  periodEnd: Date;
}

export interface WeeklyPulseTotals {
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
}

export type WeeklyPulseFreshness = "fresh" | "stale";

export interface WeeklyPulseSummary {
  period: WeeklyPulsePeriod;
  previousPeriod: WeeklyPulsePeriod | null;
  totals: WeeklyPulseTotals;
  previousTotals: WeeklyPulseTotals | null;
  deliveredDeltaPct: number | null;
  enteredDeltaPct: number | null;
  memberCount: number;
  freshness: WeeklyPulseFreshness;
  daysSinceEnd: number;
  rangeLabel: string;
}

// Una ventana semanal cuyo `periodEnd` ocurrió hace más de 14 días deja de
// ser un "pulso semanal disponible" útil y pasa a marcarse como antigua.
export const STALE_WEEK_THRESHOLD_DAYS = 14;

const ZERO_TOTALS: WeeklyPulseTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function sumTotals(rows: readonly WeeklyPulseRow[]): WeeklyPulseTotals {
  if (!rows.length) return { ...ZERO_TOTALS };
  let entered = 0;
  let moved = 0;
  let delivered = 0;
  let returned = 0;
  for (const r of rows) {
    entered += r.ordersEntered ?? 0;
    moved += r.ordersMoved ?? 0;
    delivered += r.ordersDelivered ?? 0;
    returned += r.ordersReturned ?? 0;
  }
  return {
    ordersEntered: entered,
    ordersMoved: moved,
    ordersDelivered: delivered,
    ordersReturned: returned,
  };
}

// Delta porcentual seguro: si `prev` es 0 y `curr` también, 0; si `prev` es
// 0 y `curr` > 0, null (no se define porcentaje desde cero).
function safeDeltaPct(curr: number, prev: number): number | null {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return curr === 0 ? 0 : null;
  return round2(((curr - prev) / prev) * 100);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatWeeklyRange(p: WeeklyPulsePeriod): string {
  return `${isoDate(p.periodStart)} → ${isoDate(p.periodEnd)}`;
}

// Devuelve cuántos días pasaron entre `periodEnd` y `now`. Nunca negativo,
// para que ventanas con cierre futuro (importación adelantada) salgan como 0.
export function daysSinceWeekEnd(periodEnd: Date, now: Date): number {
  const ms = now.getTime() - periodEnd.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function classifyWeeklyFreshness(
  periodEnd: Date,
  now: Date,
): WeeklyPulseFreshness {
  return daysSinceWeekEnd(periodEnd, now) > STALE_WEEK_THRESHOLD_DAYS
    ? "stale"
    : "fresh";
}

interface BuildInput {
  period: WeeklyPulsePeriod;
  previousPeriod: WeeklyPulsePeriod | null;
  currentRows: readonly WeeklyPulseRow[];
  previousRows?: readonly WeeklyPulseRow[] | null;
  now?: Date;
}

export function buildWeeklyPulseSummary(input: BuildInput): WeeklyPulseSummary {
  const now = input.now ?? new Date();
  const totals = sumTotals(input.currentRows);
  const previousTotals =
    input.previousRows && input.previousRows.length > 0
      ? sumTotals(input.previousRows)
      : null;

  const deliveredDeltaPct = previousTotals
    ? safeDeltaPct(totals.ordersDelivered, previousTotals.ordersDelivered)
    : null;
  const enteredDeltaPct = previousTotals
    ? safeDeltaPct(totals.ordersEntered, previousTotals.ordersEntered)
    : null;

  const memberIds = new Set<string>();
  for (const r of input.currentRows) {
    if (r.memberId) memberIds.add(r.memberId);
  }

  return {
    period: input.period,
    previousPeriod: input.previousPeriod,
    totals,
    previousTotals,
    deliveredDeltaPct,
    enteredDeltaPct,
    memberCount: memberIds.size,
    freshness: classifyWeeklyFreshness(input.period.periodEnd, now),
    daysSinceEnd: daysSinceWeekEnd(input.period.periodEnd, now),
    rangeLabel: formatWeeklyRange(input.period),
  };
}
