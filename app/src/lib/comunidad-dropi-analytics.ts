// Pure analytics helpers for the Comunidad Dropi "Inteligencia de Datos"
// surface. Everything here is intentionally Prisma-free: callers pre-load the
// rows they need (using either DropiWeeklyMetric or DropiMonthlyMetric, the
// real models in schema.prisma) and pass plain shapes in. That keeps the
// helpers unit-testable and lets us reuse them in API routes and UI loaders.
//
// Naming uses the same English codes as the segmentation engine so the
// outputs slot straight into existing label maps. UI copy is generated in
// Spanish via separate string-building helpers (e.g. `buildMemberDiagnostic`).

import type {
  DropiPriorityCode,
  DropiSegment,
} from "./comunidad-dropi-segments";
import { DROPI_SEGMENT_LABELS } from "./comunidad-dropi-segments";

// ─── Shared shapes ───────────────────────────────────────────────────────────

export interface OrderTotals {
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
}

export interface OrderRates {
  // moved / entered
  movementRate: number;
  // delivered / moved
  deliveryRate: number;
  // returned / moved
  returnRate: number;
}

export interface DeltaResult {
  abs: number | null;
  pct: number | null;
}

// Row shape we accept for trend / country / segment aggregations. Both
// DropiWeeklyMetric and DropiMonthlyMetric satisfy this once their Prisma
// Decimal-bearing fields are normalised to plain numbers (the helpers in this
// file never touch Decimal directly).
export interface PeriodMetricRow extends OrderTotals {
  country?: string | null;
  calculatedSegment?: string | null;
  calculatedPriority?: DropiPriorityCode | null;
}

export interface WeeklyMetricLike extends PeriodMetricRow {
  periodStart: Date;
  periodEnd: Date;
}

export interface MonthlyMetricLike extends PeriodMetricRow {
  year: number;
  month: number;
}

// ─── Safe arithmetic primitives ──────────────────────────────────────────────

const ZERO_TOTALS: OrderTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

const ZERO_RATES: OrderRates = {
  movementRate: 0,
  deliveryRate: 0,
  returnRate: 0,
};

// Round a number to 2 decimals without introducing floating-point noise. Used
// for percentages so the JSON we serialise is stable across runs and easy to
// assert against in tests.
function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

// Safe percentage: returns 0 when the denominator is missing or non-positive,
// caps at 100 so cross-period skew never blows the UI up. Returns a plain
// 0-100 number with at most two decimals.
export function safePercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  if (denominator <= 0) return 0;
  const pct = (numerator / denominator) * 100;
  if (pct <= 0) return 0;
  if (pct >= 100) return 100;
  return round2(pct);
}

// Safe delta between two periods. Returns null in `abs` when there is no
// comparable previous period, and null in `pct` when the previous value is
// zero (a 0→n move has no defined percentage). The absolute delta is always
// returned when both values are known so the UI can fall back to it.
export function safeDelta(
  current: number,
  previous: number | null | undefined,
): DeltaResult {
  if (previous == null || !Number.isFinite(previous)) {
    return { abs: null, pct: null };
  }
  const abs = current - previous;
  if (previous === 0) {
    return { abs, pct: current === 0 ? 0 : null };
  }
  return { abs, pct: round2((abs / previous) * 100) };
}

// ─── Aggregations ────────────────────────────────────────────────────────────

export function sumTotals(rows: readonly OrderTotals[]): OrderTotals {
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

// Weighted aggregate rates. Computed on the SUMS, not as an average of per-row
// rates, so a member who shipped 100 orders weighs 10× more than one who
// shipped 10 — which is what "tasa global" means operationally.
export function weightedRates(rows: readonly OrderTotals[]): OrderRates {
  const totals = sumTotals(rows);
  return ratesFromTotals(totals);
}

export function ratesFromTotals(totals: OrderTotals): OrderRates {
  return {
    movementRate: safePercent(totals.ordersMoved, totals.ordersEntered),
    deliveryRate: safePercent(totals.ordersDelivered, totals.ordersMoved),
    returnRate: safePercent(totals.ordersReturned, totals.ordersMoved),
  };
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface OverviewMemberSnapshot {
  currentSegment?: string | null;
  currentPriority?: DropiPriorityCode | null;
  currentStatus?: "ACTIVE" | "INACTIVE" | "WATCHLIST";
  linkedStudentId?: string | null;
  country?: string | null;
}

export interface OverviewAggregate {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  watchlistMembers: number;
  linkedMembers: number;
  countriesCount: number;
  segmentCounts: Record<string, number>;
  priorityCounts: Record<DropiPriorityCode, number>;
  current: {
    totals: OrderTotals;
    rates: OrderRates;
    memberCount: number;
  };
  previous: {
    totals: OrderTotals;
    rates: OrderRates;
    memberCount: number;
  } | null;
  deltas: {
    ordersEntered: DeltaResult;
    ordersMoved: DeltaResult;
    ordersDelivered: DeltaResult;
    ordersReturned: DeltaResult;
    movementRate: DeltaResult;
    deliveryRate: DeltaResult;
    returnRate: DeltaResult;
  } | null;
}

export function buildOverview(input: {
  members: readonly OverviewMemberSnapshot[];
  currentRows: readonly OrderTotals[];
  previousRows?: readonly OrderTotals[] | null;
  currentMemberCount?: number;
  previousMemberCount?: number;
}): OverviewAggregate {
  const members = input.members ?? [];
  const segmentCounts: Record<string, number> = {};
  const priorityCounts: Record<DropiPriorityCode, number> = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
  };
  const countrySet = new Set<string>();
  let active = 0;
  let inactive = 0;
  let watchlist = 0;
  let linked = 0;

  for (const m of members) {
    if (m.currentStatus === "ACTIVE") active++;
    else if (m.currentStatus === "INACTIVE") inactive++;
    else if (m.currentStatus === "WATCHLIST") watchlist++;
    if (m.linkedStudentId) linked++;
    if (m.country) countrySet.add(m.country);
    if (m.currentSegment) {
      segmentCounts[m.currentSegment] = (segmentCounts[m.currentSegment] ?? 0) + 1;
    }
    if (m.currentPriority) {
      priorityCounts[m.currentPriority] =
        (priorityCounts[m.currentPriority] ?? 0) + 1;
    }
  }

  const currentTotals = sumTotals(input.currentRows);
  const currentRates = ratesFromTotals(currentTotals);

  let previous: OverviewAggregate["previous"] = null;
  let deltas: OverviewAggregate["deltas"] = null;
  if (input.previousRows && input.previousRows.length > 0) {
    const previousTotals = sumTotals(input.previousRows);
    const previousRates = ratesFromTotals(previousTotals);
    previous = {
      totals: previousTotals,
      rates: previousRates,
      memberCount: input.previousMemberCount ?? 0,
    };
    deltas = {
      ordersEntered: safeDelta(currentTotals.ordersEntered, previousTotals.ordersEntered),
      ordersMoved: safeDelta(currentTotals.ordersMoved, previousTotals.ordersMoved),
      ordersDelivered: safeDelta(currentTotals.ordersDelivered, previousTotals.ordersDelivered),
      ordersReturned: safeDelta(currentTotals.ordersReturned, previousTotals.ordersReturned),
      movementRate: safeDelta(currentRates.movementRate, previousRates.movementRate),
      deliveryRate: safeDelta(currentRates.deliveryRate, previousRates.deliveryRate),
      returnRate: safeDelta(currentRates.returnRate, previousRates.returnRate),
    };
  }

  return {
    totalMembers: members.length,
    activeMembers: active,
    inactiveMembers: inactive,
    watchlistMembers: watchlist,
    linkedMembers: linked,
    countriesCount: countrySet.size,
    segmentCounts,
    priorityCounts,
    current: {
      totals: currentTotals,
      rates: currentRates,
      memberCount: input.currentMemberCount ?? 0,
    },
    previous,
    deltas,
  };
}

// ─── Trend ───────────────────────────────────────────────────────────────────

export interface TrendBucket {
  key: string;
  label: string;
  totals: OrderTotals;
  rates: OrderRates;
  deltaEnteredPct: number | null;
  memberCount: number;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Group a list of weekly rows by period (start..end). Sorts ascending so the
// last entry is always the latest week. Member count is the distinct count of
// memberIds when provided, otherwise 0.
export function buildWeeklyTrend(
  rows: ReadonlyArray<WeeklyMetricLike & { memberId?: string }>,
): TrendBucket[] {
  const buckets = new Map<
    string,
    {
      key: string;
      start: Date;
      end: Date;
      totals: OrderTotals;
      members: Set<string>;
    }
  >();
  for (const r of rows) {
    const key = `${toISODate(r.periodStart)}_${toISODate(r.periodEnd)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.totals = sumTotals([existing.totals, r]);
      if (r.memberId) existing.members.add(r.memberId);
    } else {
      const members = new Set<string>();
      if (r.memberId) members.add(r.memberId);
      buckets.set(key, {
        key,
        start: r.periodStart,
        end: r.periodEnd,
        totals: sumTotals([r]),
        members,
      });
    }
  }
  const sorted = Array.from(buckets.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  return sorted.map((b, i) => {
    const previous = i > 0 ? sorted[i - 1].totals.ordersEntered : null;
    return {
      key: b.key,
      label: `${toISODate(b.start)} → ${toISODate(b.end)}`,
      totals: b.totals,
      rates: ratesFromTotals(b.totals),
      deltaEnteredPct: safeDelta(b.totals.ordersEntered, previous).pct,
      memberCount: b.members.size,
    };
  });
}

const SPANISH_MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function buildMonthlyTrend(
  rows: ReadonlyArray<MonthlyMetricLike & { memberId?: string }>,
): TrendBucket[] {
  const buckets = new Map<
    string,
    {
      key: string;
      year: number;
      month: number;
      totals: OrderTotals;
      members: Set<string>;
    }
  >();
  for (const r of rows) {
    const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.totals = sumTotals([existing.totals, r]);
      if (r.memberId) existing.members.add(r.memberId);
    } else {
      const members = new Set<string>();
      if (r.memberId) members.add(r.memberId);
      buckets.set(key, {
        key,
        year: r.year,
        month: r.month,
        totals: sumTotals([r]),
        members,
      });
    }
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  return sorted.map((b, i) => {
    const previous = i > 0 ? sorted[i - 1].totals.ordersEntered : null;
    const monthIdx = Math.max(0, Math.min(11, b.month - 1));
    return {
      key: b.key,
      label: `${SPANISH_MONTH_NAMES[monthIdx]} ${b.year}`,
      totals: b.totals,
      rates: ratesFromTotals(b.totals),
      deltaEnteredPct: safeDelta(b.totals.ordersEntered, previous).pct,
      memberCount: b.members.size,
    };
  });
}

// ─── Country and segment distribution ────────────────────────────────────────

export interface CountryBucket {
  country: string;
  memberCount: number;
  totals: OrderTotals;
  rates: OrderRates;
  share: number;
}

export function buildByCountry(input: {
  members: ReadonlyArray<{ country?: string | null }>;
  rows?: ReadonlyArray<PeriodMetricRow> | null;
}): CountryBucket[] {
  const memberCounts = new Map<string, number>();
  for (const m of input.members) {
    const c = m.country ?? "—";
    memberCounts.set(c, (memberCounts.get(c) ?? 0) + 1);
  }
  const totalsByCountry = new Map<string, OrderTotals>();
  for (const r of input.rows ?? []) {
    const c = r.country ?? "—";
    const prev = totalsByCountry.get(c) ?? { ...ZERO_TOTALS };
    totalsByCountry.set(c, sumTotals([prev, r]));
  }
  const totalMembers = input.members.length || 1;
  const result: CountryBucket[] = [];
  const countries = new Set<string>([
    ...memberCounts.keys(),
    ...totalsByCountry.keys(),
  ]);
  for (const c of countries) {
    const totals = totalsByCountry.get(c) ?? { ...ZERO_TOTALS };
    const memberCount = memberCounts.get(c) ?? 0;
    result.push({
      country: c,
      memberCount,
      totals,
      rates: ratesFromTotals(totals),
      share: round2((memberCount / totalMembers) * 100),
    });
  }
  return result.sort((a, b) => b.memberCount - a.memberCount);
}

export interface SegmentBucket {
  segment: string;
  label: string;
  memberCount: number;
  share: number;
}

export function buildBySegment(
  members: ReadonlyArray<{ currentSegment?: string | null }>,
): SegmentBucket[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const s = m.currentSegment ?? "UNSEGMENTED";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const total = members.length || 1;
  return Array.from(counts.entries())
    .map(([segment, memberCount]) => ({
      segment,
      label:
        DROPI_SEGMENT_LABELS[segment as DropiSegment] ??
        (segment === "UNSEGMENTED" ? "Sin segmentar" : segment),
      memberCount,
      share: round2((memberCount / total) * 100),
    }))
    .sort((a, b) => b.memberCount - a.memberCount);
}

// ─── Opportunities / ranking ─────────────────────────────────────────────────

export interface MemberOpportunityInput {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currentSegment?: string | null;
  currentPriority?: DropiPriorityCode | null;
  currentStatus?: "ACTIVE" | "INACTIVE" | "WATCHLIST";
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  movementRate: number;
  deliveryRate: number;
  returnRate: number;
  deltaOrdersPercent?: number | null;
}

export interface MemberOpportunity {
  id: string;
  displayName: string;
  country: string | null;
  segment: string | null;
  priority: DropiPriorityCode | null;
  ordersEntered: number;
  movementRate: number;
  deliveryRate: number;
  returnRate: number;
  deltaOrdersPercent: number | null;
  score: number;
  reason: string;
}

const PRIORITY_WEIGHT: Record<DropiPriorityCode, number> = {
  P1: 100,
  P2: 60,
  P3: 30,
  P4: 80,
};

// Compose a single "opportunity score" so the UI can rank the highest-impact
// follow-ups first. The score favours active members with measurable volume
// or a sharp drop, and downweights inactive / no-data members so they don't
// crowd the top of the list.
export function scoreOpportunity(m: MemberOpportunityInput): number {
  let score = PRIORITY_WEIGHT[m.currentPriority ?? "P3"] ?? 30;
  const volume = Math.max(0, m.ordersEntered);
  score += Math.min(40, Math.log10(volume + 1) * 20);
  if (m.returnRate >= 30) score += 25;
  if ((m.deltaOrdersPercent ?? 0) <= -25) score += 20;
  if (m.currentStatus === "INACTIVE") score -= 20;
  if (m.currentSegment === "TOP_PERFORMER") score += 10;
  return round2(score);
}

function reasonForOpportunity(m: MemberOpportunityInput): string {
  if (m.ordersEntered <= 0) {
    return "Sin pedidos ingresados en el último período.";
  }
  if (m.returnRate >= 30) {
    return `Devoluciones altas (${m.returnRate}%). Revisar productos y promesa.`;
  }
  if ((m.deltaOrdersPercent ?? 0) <= -25) {
    return `Caída fuerte (${m.deltaOrdersPercent}% vs período previo).`;
  }
  if (m.currentSegment === "TOP_PERFORMER") {
    return "Mejor vendedor: oportunidad de caso de éxito.";
  }
  if (m.currentSegment === "LOW_VOLUME") {
    return "Bajo volumen: hay espacio para crecer con acompañamiento.";
  }
  if (m.currentSegment === "GROWING") {
    return "En crecimiento: reforzar para sostener el ritmo.";
  }
  if (m.currentSegment === "RECOVERED") {
    return "Se recuperó luego de un período sin ventas.";
  }
  return "Caso prioritario por segmentación.";
}

export function rankOpportunities(
  rows: readonly MemberOpportunityInput[],
  limit = 10,
): MemberOpportunity[] {
  const ranked = rows.map((m) => ({
    id: m.id,
    displayName: m.fullName ?? m.email ?? m.phone ?? m.id,
    country: m.country ?? null,
    segment: m.currentSegment ?? null,
    priority: m.currentPriority ?? null,
    ordersEntered: m.ordersEntered,
    movementRate: m.movementRate,
    deliveryRate: m.deliveryRate,
    returnRate: m.returnRate,
    deltaOrdersPercent: m.deltaOrdersPercent ?? null,
    score: scoreOpportunity(m),
    reason: reasonForOpportunity(m),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, Math.max(0, limit));
}

// ─── Member diagnostic ───────────────────────────────────────────────────────

export interface MemberDiagnosticInput {
  member: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
    currentSegment?: string | null;
    currentPriority?: DropiPriorityCode | null;
    currentStatus?: "ACTIVE" | "INACTIVE" | "WATCHLIST";
    firstReportedAt?: Date | null;
    lastReportedAt?: Date | null;
  };
  weekly: ReadonlyArray<
    WeeklyMetricLike & {
      deltaOrdersPercent?: number | null;
    }
  >;
  monthly?: ReadonlyArray<MonthlyMetricLike> | null;
}

export interface MemberDiagnostic {
  memberId: string;
  displayName: string;
  segmentLabel: string | null;
  priority: DropiPriorityCode | null;
  status: "ACTIVE" | "INACTIVE" | "WATCHLIST" | null;
  summary: string;
  highlights: string[];
  warnings: string[];
  suggestions: string[];
  totals: OrderTotals;
  rates: OrderRates;
  delta: DeltaResult;
  trend: "UP" | "DOWN" | "STABLE" | "NEW" | "ZERO" | "INSUFFICIENT_DATA";
  periodsAnalysed: number;
  latestPeriodLabel: string | null;
}

function trendFromWeekly(
  weekly: ReadonlyArray<WeeklyMetricLike>,
): {
  delta: DeltaResult;
  trend: MemberDiagnostic["trend"];
  latestLabel: string | null;
} {
  if (weekly.length === 0) {
    return { delta: { abs: null, pct: null }, trend: "INSUFFICIENT_DATA", latestLabel: null };
  }
  const sorted = [...weekly].sort(
    (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
  );
  const last = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const delta = safeDelta(last.ordersEntered, prev?.ordersEntered ?? null);
  let trend: MemberDiagnostic["trend"];
  if (last.ordersEntered === 0) trend = "ZERO";
  else if (prev == null) trend = "NEW";
  else if (last.ordersEntered > prev.ordersEntered) trend = "UP";
  else if (last.ordersEntered < prev.ordersEntered) trend = "DOWN";
  else trend = "STABLE";
  const label = `${toISODate(last.periodStart)} → ${toISODate(last.periodEnd)}`;
  return { delta, trend, latestLabel: label };
}

export function buildMemberDiagnostic(
  input: MemberDiagnosticInput,
): MemberDiagnostic {
  const { member, weekly, monthly } = input;
  const totals = sumTotals(weekly);
  const rates = ratesFromTotals(totals);
  const { delta, trend, latestLabel } = trendFromWeekly(weekly);

  const highlights: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (weekly.length === 0) {
    warnings.push("Aún no hay reportes semanales para este miembro.");
    suggestions.push(
      "Sube un reporte semanal o mensual para empezar a calcular su segmento.",
    );
  } else {
    if (totals.ordersEntered === 0) {
      warnings.push("Sin pedidos ingresados en el período analizado.");
      suggestions.push(
        "Contactar para entender si dejó de operar o cambió de tienda.",
      );
    }
    if (rates.returnRate >= 30) {
      warnings.push(
        `Tasa de devoluciones elevada (${rates.returnRate}%) sobre ${totals.ordersMoved} movidas.`,
      );
      suggestions.push(
        "Revisar productos con devolución alta y reforzar promesa de venta.",
      );
    } else if (rates.returnRate > 0) {
      highlights.push(
        `Tasa de devoluciones bajo control (${rates.returnRate}%).`,
      );
    }
    if (rates.deliveryRate >= 80) {
      highlights.push(`Entrega sólida (${rates.deliveryRate}% sobre movidas).`);
    } else if (rates.deliveryRate > 0 && rates.deliveryRate < 50) {
      warnings.push(
        `Entrega baja (${rates.deliveryRate}%): muchas órdenes movidas no llegan a entregarse.`,
      );
      suggestions.push(
        "Validar logística y cobertura de las ciudades atendidas.",
      );
    }
    if (delta.pct != null && delta.pct <= -25) {
      warnings.push(
        `Caída fuerte vs. período anterior (${delta.pct}%).`,
      );
      suggestions.push(
        "Agendar llamada de seguimiento para entender el bajón.",
      );
    } else if (delta.pct != null && delta.pct >= 25) {
      highlights.push(`Crecimiento sostenido (${delta.pct}% vs. anterior).`);
      suggestions.push(
        "Identificar qué está funcionando y replicarlo en próximas semanas.",
      );
    }
    if (member.currentSegment === "TOP_PERFORMER") {
      highlights.push("Mejor vendedor: candidato a caso de éxito o mentoría.");
    }
    if (member.currentStatus === "INACTIVE") {
      warnings.push("El miembro está marcado como INACTIVO en la comunidad.");
    }
  }

  if ((monthly?.length ?? 0) >= 2) {
    const sorted = [...(monthly ?? [])].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    );
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    const monthlyDelta = safeDelta(last.ordersEntered, prev.ordersEntered);
    if (monthlyDelta.pct != null) {
      const label = `${SPANISH_MONTH_NAMES[Math.max(0, last.month - 1)]} ${last.year}`;
      if (monthlyDelta.pct >= 25) {
        highlights.push(
          `${label} cerró ${monthlyDelta.pct}% arriba vs. mes previo.`,
        );
      } else if (monthlyDelta.pct <= -25) {
        warnings.push(
          `${label} cerró ${monthlyDelta.pct}% abajo vs. mes previo.`,
        );
      }
    }
  }

  const displayName =
    member.fullName ?? member.email ?? member.phone ?? member.id;
  const summary = buildSummarySentence({
    displayName,
    country: member.country ?? null,
    segment: member.currentSegment ?? null,
    trend,
    totals,
    rates,
    delta,
  });

  return {
    memberId: member.id,
    displayName,
    segmentLabel: member.currentSegment
      ? DROPI_SEGMENT_LABELS[member.currentSegment as DropiSegment] ??
        member.currentSegment
      : null,
    priority: member.currentPriority ?? null,
    status: member.currentStatus ?? null,
    summary,
    highlights,
    warnings,
    suggestions,
    totals,
    rates,
    delta,
    trend,
    periodsAnalysed: weekly.length,
    latestPeriodLabel: latestLabel,
  };
}

function buildSummarySentence(args: {
  displayName: string;
  country: string | null;
  segment: string | null;
  trend: MemberDiagnostic["trend"];
  totals: OrderTotals;
  rates: OrderRates;
  delta: DeltaResult;
}): string {
  const { displayName, country, segment, trend, totals, rates, delta } = args;
  if (trend === "INSUFFICIENT_DATA") {
    return `${displayName} aún no tiene reportes para analizar.`;
  }
  const segLabel = segment
    ? DROPI_SEGMENT_LABELS[segment as DropiSegment] ?? segment
    : "sin segmento";
  const countryFragment = country ? ` en ${country}` : "";
  const trendFragment = (() => {
    switch (trend) {
      case "UP":
        return `subiendo${delta.pct != null ? ` (${delta.pct}%)` : ""}`;
      case "DOWN":
        return `bajando${delta.pct != null ? ` (${delta.pct}%)` : ""}`;
      case "STABLE":
        return "estable vs. período anterior";
      case "NEW":
        return "primera medición";
      case "ZERO":
        return "sin ventas en el período";
      default:
        return "sin tendencia clara";
    }
  })();
  return (
    `${displayName} (${segLabel})${countryFragment}: ${totals.ordersEntered} pedidos ingresados, ` +
    `${rates.movementRate}% movidas, ${rates.deliveryRate}% entregadas, ` +
    `${rates.returnRate}% devueltas — ${trendFragment}.`
  );
}
