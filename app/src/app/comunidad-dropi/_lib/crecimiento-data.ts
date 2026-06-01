// Server-side loader for /comunidad-dropi/crecimiento.
//
// Capa de lectura sobre las métricas existentes (DropiWeeklyMetric y
// DropiMonthlyMetric). No agrega tablas ni columnas: agrupa, suma y compara
// con `buildRadar` + helpers puros del dominio Dropi.
//
// La vista cubre dos ejes:
//   1) Comparativo tipo Shopify — período principal vs. período comparación
//      con KPIs, serie temporal con superposición y desglose por miembro.
//      Granularidad por defecto: SEMANAL. La mensual queda como override.
//   2) Cohortes mensuales — Top 20 por entregas, Cohorte en caída
//      (alerta) y Cohorte de crecimiento con bandas configurables. Estas
//      siempre se calculan sobre el mes seleccionado (motor mensual).

import { prisma } from "@/lib/prisma";
import {
  buildRadar,
  type Radar,
  type RadarMemberInput,
  type RadarOrderTotals,
} from "@/lib/comunidad-dropi-radar";
import { buildAllMemberRows, type MemberPeriodRow } from "./rendimiento";

export type Granularity = "weekly" | "monthly";

const COMMON_MEMBER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  country: true,
  currentSegment: true,
  currentPriority: true,
  currentStatus: true,
  linkedStudentId: true,
} as const;

const ZERO_TOTALS: RadarOrderTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const SPANISH_MONTHS_SHORT = [
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Comparativo: descripciones de período ──────────────────────────────────

export interface PeriodWeekly {
  granularity: "weekly";
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export interface PeriodMonthly {
  granularity: "monthly";
  key: string;
  label: string;
  year: number;
  month: number;
}

export type PeriodRef = PeriodWeekly | PeriodMonthly;

export interface ComparativoBucket {
  key: string;
  label: string;
  totals: RadarOrderTotals;
}

export interface ComparativoKpi {
  current: number;
  comparison: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
}

export interface ComparativoRateKpi {
  current: number;
  comparison: number | null;
  deltaPts: number | null;
}

export interface ComparativoKpis {
  delivered: ComparativoKpi;
  entered: ComparativoKpi;
  returned: ComparativoKpi;
  deliveryRate: ComparativoRateKpi;
  deliveryRateOperational: ComparativoRateKpi;
}

export interface ComparativoMemberRow {
  id: string;
  fullName: string | null;
  country: string | null;
  current: RadarOrderTotals;
  comparison: RadarOrderTotals | null;
  deliveredDelta: number | null;
  enteredDelta: number | null;
}

export interface Comparativo {
  granularity: Granularity;
  current: PeriodRef;
  comparison: PeriodRef | null;
  kpis: ComparativoKpis;
  currentSeries: ComparativoBucket[];
  comparisonSeries: ComparativoBucket[];
  topEntered: ComparativoMemberRow[];
  topDelivered: ComparativoMemberRow[];
  // Todas las filas de miembros del período (no solo top), incluyendo a
  // quienes solo aparecen en la comparación (current = 0). Alimenta las
  // listas Top 20 / En caída / En aumento de la sección de Rendimiento.
  memberRows: MemberPeriodRow[];
  available: PeriodRef[];
}

function weeklyKey(start: Date, end: Date): string {
  return `w:${isoDate(start)}_${isoDate(end)}`;
}

function monthlyKey(year: number, month: number): string {
  return `m:${year}-${month}`;
}

function weeklyLabel(start: Date, end: Date): string {
  return `${isoDate(start)} → ${isoDate(end)}`;
}

function monthlyLabel(year: number, month: number): string {
  const idx = Math.max(0, Math.min(11, month - 1));
  return `${SPANISH_MONTHS[idx]} ${year}`;
}

function monthlyShortLabel(year: number, month: number): string {
  const idx = Math.max(0, Math.min(11, month - 1));
  return `${SPANISH_MONTHS_SHORT[idx]} ${String(year).slice(-2)}`;
}

function weeklyShortLabel(start: Date): string {
  // Solo MM/DD para no saturar el chart.
  const m = String(start.getUTCMonth() + 1).padStart(2, "0");
  const d = String(start.getUTCDate()).padStart(2, "0");
  return `${m}/${d}`;
}

function sumTotals(rows: readonly RadarOrderTotals[]): RadarOrderTotals {
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

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function safePct(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return round2((num / den) * 100);
}

function buildKpi(curr: number, comp: number | null): ComparativoKpi {
  if (comp == null) {
    return { current: curr, comparison: null, deltaAbs: null, deltaPct: null };
  }
  const deltaAbs = curr - comp;
  let deltaPct: number | null;
  if (comp === 0) {
    deltaPct = curr === 0 ? 0 : null;
  } else {
    deltaPct = round2((deltaAbs / comp) * 100);
  }
  return { current: curr, comparison: comp, deltaAbs, deltaPct };
}

function buildRateKpi(curr: number, comp: number | null): ComparativoRateKpi {
  if (comp == null) {
    return { current: curr, comparison: null, deltaPts: null };
  }
  return { current: curr, comparison: comp, deltaPts: round2(curr - comp) };
}

// ─── Periodos disponibles ───────────────────────────────────────────────────

async function listWeeklyPeriods(): Promise<PeriodWeekly[]> {
  const grouped = await prisma.dropiWeeklyMetric.groupBy({
    by: ["periodStart", "periodEnd"],
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
  });
  return grouped.map((g) => ({
    granularity: "weekly" as const,
    key: weeklyKey(g.periodStart, g.periodEnd),
    label: weeklyLabel(g.periodStart, g.periodEnd),
    start: g.periodStart,
    end: g.periodEnd,
  }));
}

async function listMonthlyPeriods(): Promise<PeriodMonthly[]> {
  const grouped = await prisma.dropiMonthlyMetric.groupBy({
    by: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return grouped.map((g) => ({
    granularity: "monthly" as const,
    key: monthlyKey(g.year, g.month),
    label: monthlyLabel(g.year, g.month),
    year: g.year,
    month: g.month,
  }));
}

function findWeeklyByKey(
  list: PeriodWeekly[],
  key: string | undefined | null,
): PeriodWeekly | null {
  if (!key) return null;
  return list.find((p) => p.key === key) ?? null;
}

function findMonthlyByKey(
  list: PeriodMonthly[],
  key: string | undefined | null,
): PeriodMonthly | null {
  if (!key) return null;
  return list.find((p) => p.key === key) ?? null;
}

// ─── Weekly comparativo ─────────────────────────────────────────────────────

interface WeeklyMetricRow {
  memberId: string;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
}

async function loadWeeklyRows(
  start: Date,
  end: Date,
): Promise<WeeklyMetricRow[]> {
  return prisma.dropiWeeklyMetric.findMany({
    where: { periodStart: start, periodEnd: end },
    select: {
      memberId: true,
      ordersEntered: true,
      ordersMoved: true,
      ordersDelivered: true,
      ordersReturned: true,
    },
  });
}

async function loadWeeklySeries(
  upTo: PeriodWeekly,
  bucketCount: number,
  pool: PeriodWeekly[],
): Promise<ComparativoBucket[]> {
  const idx = pool.findIndex((p) => p.key === upTo.key);
  if (idx < 0) return [];
  const slice = pool.slice(idx, idx + bucketCount);
  const ordered = [...slice].sort((a, b) => a.start.getTime() - b.start.getTime());
  const results: ComparativoBucket[] = [];
  for (const p of ordered) {
    const rows = await loadWeeklyRows(p.start, p.end);
    results.push({
      key: p.key,
      label: weeklyShortLabel(p.start),
      totals: sumTotals(rows),
    });
  }
  return results;
}

async function loadMonthlyRows(
  year: number,
  month: number,
): Promise<WeeklyMetricRow[]> {
  return prisma.dropiMonthlyMetric.findMany({
    where: { year, month },
    select: {
      memberId: true,
      ordersEntered: true,
      ordersMoved: true,
      ordersDelivered: true,
      ordersReturned: true,
    },
  });
}

async function loadMonthlySeries(
  upTo: PeriodMonthly,
  bucketCount: number,
  pool: PeriodMonthly[],
): Promise<ComparativoBucket[]> {
  const idx = pool.findIndex((p) => p.key === upTo.key);
  if (idx < 0) return [];
  const slice = pool.slice(idx, idx + bucketCount);
  const ordered = [...slice].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
  const results: ComparativoBucket[] = [];
  for (const p of ordered) {
    const rows = await loadMonthlyRows(p.year, p.month);
    results.push({
      key: p.key,
      label: monthlyShortLabel(p.year, p.month),
      totals: sumTotals(rows),
    });
  }
  return results;
}

// Top miembros por entregadas / ingresadas, con totales de comparación
// alineados para mostrar variación.
function buildMemberRows(
  currentRows: WeeklyMetricRow[],
  comparisonRows: WeeklyMetricRow[],
  memberMeta: Map<
    string,
    { fullName: string | null; country: string | null }
  >,
): {
  topEntered: ComparativoMemberRow[];
  topDelivered: ComparativoMemberRow[];
} {
  const currentByMember = new Map<string, RadarOrderTotals>();
  for (const r of currentRows) {
    const existing = currentByMember.get(r.memberId) ?? { ...ZERO_TOTALS };
    currentByMember.set(r.memberId, {
      ordersEntered: existing.ordersEntered + r.ordersEntered,
      ordersMoved: existing.ordersMoved + r.ordersMoved,
      ordersDelivered: existing.ordersDelivered + r.ordersDelivered,
      ordersReturned: existing.ordersReturned + r.ordersReturned,
    });
  }
  const comparisonByMember = new Map<string, RadarOrderTotals>();
  for (const r of comparisonRows) {
    const existing = comparisonByMember.get(r.memberId) ?? { ...ZERO_TOTALS };
    comparisonByMember.set(r.memberId, {
      ordersEntered: existing.ordersEntered + r.ordersEntered,
      ordersMoved: existing.ordersMoved + r.ordersMoved,
      ordersDelivered: existing.ordersDelivered + r.ordersDelivered,
      ordersReturned: existing.ordersReturned + r.ordersReturned,
    });
  }
  const rows: ComparativoMemberRow[] = [];
  for (const [id, current] of currentByMember.entries()) {
    const comp = comparisonByMember.get(id) ?? null;
    const meta = memberMeta.get(id);
    rows.push({
      id,
      fullName: meta?.fullName ?? null,
      country: meta?.country ?? null,
      current,
      comparison: comp,
      deliveredDelta:
        comp == null ? null : current.ordersDelivered - comp.ordersDelivered,
      enteredDelta:
        comp == null ? null : current.ordersEntered - comp.ordersEntered,
    });
  }
  const topDelivered = [...rows]
    .filter((r) => r.current.ordersDelivered > 0)
    .sort(
      (a, b) => b.current.ordersDelivered - a.current.ordersDelivered,
    )
    .slice(0, 10);
  const topEntered = [...rows]
    .filter((r) => r.current.ordersEntered > 0)
    .sort((a, b) => b.current.ordersEntered - a.current.ordersEntered)
    .slice(0, 10);
  return { topEntered, topDelivered };
}

async function loadMemberMeta(
  memberIds: string[],
): Promise<Map<string, { fullName: string | null; country: string | null }>> {
  if (memberIds.length === 0) return new Map();
  const rows = await prisma.dropiCommunityMember.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, fullName: true, country: true },
  });
  const map = new Map<
    string,
    { fullName: string | null; country: string | null }
  >();
  for (const r of rows) {
    map.set(r.id, { fullName: r.fullName, country: r.country });
  }
  return map;
}

// ─── Loader principal ───────────────────────────────────────────────────────

export interface ComparativoLoadInput {
  granularity: Granularity;
  currentKey?: string | null;
  comparisonKey?: string | null;
  // Mes al que caer si se pide granularidad semanal pero no hay semanas
  // cargadas. Normalmente es el mes activo del Radar, para que la sección de
  // Rendimiento nunca quede vacía cuando sí existe un cierre mensual.
  fallbackMonthly?: { year: number; month: number } | null;
}

export async function loadComparativo(
  input: ComparativoLoadInput,
): Promise<Comparativo | null> {
  if (input.granularity === "weekly") {
    const periods = await listWeeklyPeriods();
    if (periods.length === 0) {
      // Sin semanas: caemos a mensual usando el mes del Radar (o el último
      // mensual disponible) en vez de devolver `null` y dejar la sección
      // vacía. Los keys semanales no aplican al mensual, así que arrancamos
      // sin comparación explícita y dejamos el default del motor mensual.
      const fallbackKey = input.fallbackMonthly
        ? monthlyKey(input.fallbackMonthly.year, input.fallbackMonthly.month)
        : null;
      return loadMonthlyComparativo(fallbackKey, null);
    }
    const current =
      findWeeklyByKey(periods, input.currentKey ?? null) ?? periods[0];
    const idx = periods.findIndex((p) => p.key === current.key);
    const defaultComp = idx + 1 < periods.length ? periods[idx + 1] : null;
    const comparison =
      findWeeklyByKey(periods, input.comparisonKey ?? null) ?? defaultComp;

    const [currentRows, comparisonRows, currentSeries, comparisonSeries] =
      await Promise.all([
        loadWeeklyRows(current.start, current.end),
        comparison
          ? loadWeeklyRows(comparison.start, comparison.end)
          : Promise.resolve([] as WeeklyMetricRow[]),
        loadWeeklySeries(current, 8, periods),
        comparison
          ? loadWeeklySeries(comparison, 8, periods)
          : Promise.resolve([] as ComparativoBucket[]),
      ]);

    const memberIds = Array.from(
      new Set([
        ...currentRows.map((r) => r.memberId),
        ...comparisonRows.map((r) => r.memberId),
      ]),
    );
    const meta = await loadMemberMeta(memberIds);
    const { topEntered, topDelivered } = buildMemberRows(
      currentRows,
      comparisonRows,
      meta,
    );
    const memberRows = buildAllMemberRows(currentRows, comparisonRows, meta);

    return buildComparativoFromTotals({
      granularity: "weekly",
      current,
      comparison,
      currentRows,
      comparisonRows,
      currentSeries,
      comparisonSeries,
      topEntered,
      topDelivered,
      memberRows,
      available: periods,
    });
  }

  return loadMonthlyComparativo(
    input.currentKey ?? null,
    input.comparisonKey ?? null,
  );
}

async function loadMonthlyComparativo(
  currentKey: string | null,
  comparisonKey: string | null,
): Promise<Comparativo | null> {
  const periods = await listMonthlyPeriods();
  if (periods.length === 0) return null;
  const current = findMonthlyByKey(periods, currentKey) ?? periods[0];
  const idx = periods.findIndex((p) => p.key === current.key);
  const defaultComp = idx + 1 < periods.length ? periods[idx + 1] : null;
  const comparison = findMonthlyByKey(periods, comparisonKey) ?? defaultComp;

  const [currentRows, comparisonRows, currentSeries, comparisonSeries] =
    await Promise.all([
      loadMonthlyRows(current.year, current.month),
      comparison
        ? loadMonthlyRows(comparison.year, comparison.month)
        : Promise.resolve([] as WeeklyMetricRow[]),
      loadMonthlySeries(current, 6, periods),
      comparison
        ? loadMonthlySeries(comparison, 6, periods)
        : Promise.resolve([] as ComparativoBucket[]),
    ]);

  const memberIds = Array.from(
    new Set([
      ...currentRows.map((r) => r.memberId),
      ...comparisonRows.map((r) => r.memberId),
    ]),
  );
  const meta = await loadMemberMeta(memberIds);
  const { topEntered, topDelivered } = buildMemberRows(
    currentRows,
    comparisonRows,
    meta,
  );
  const memberRows = buildAllMemberRows(currentRows, comparisonRows, meta);

  return buildComparativoFromTotals({
    granularity: "monthly",
    current,
    comparison,
    currentRows,
    comparisonRows,
    currentSeries,
    comparisonSeries,
    topEntered,
    topDelivered,
    memberRows,
    available: periods,
  });
}

function buildComparativoFromTotals(input: {
  granularity: Granularity;
  current: PeriodRef;
  comparison: PeriodRef | null;
  currentRows: WeeklyMetricRow[];
  comparisonRows: WeeklyMetricRow[];
  currentSeries: ComparativoBucket[];
  comparisonSeries: ComparativoBucket[];
  topEntered: ComparativoMemberRow[];
  topDelivered: ComparativoMemberRow[];
  memberRows: MemberPeriodRow[];
  available: PeriodRef[];
}): Comparativo {
  const currentTotals = sumTotals(input.currentRows);
  const comparisonTotals =
    input.comparison == null ? null : sumTotals(input.comparisonRows);
  const compE = comparisonTotals?.ordersEntered ?? null;
  const compD = comparisonTotals?.ordersDelivered ?? null;
  const compR = comparisonTotals?.ordersReturned ?? null;
  const compM = comparisonTotals?.ordersMoved ?? null;
  const currentDeliveryRate = safePct(
    currentTotals.ordersDelivered,
    currentTotals.ordersEntered,
  );
  const currentDeliveryRateOp = safePct(
    currentTotals.ordersDelivered,
    currentTotals.ordersMoved,
  );
  const compDeliveryRate =
    comparisonTotals == null
      ? null
      : safePct(comparisonTotals.ordersDelivered, comparisonTotals.ordersEntered);
  const compDeliveryRateOp =
    comparisonTotals == null
      ? null
      : safePct(comparisonTotals.ordersDelivered, comparisonTotals.ordersMoved);

  return {
    granularity: input.granularity,
    current: input.current,
    comparison: input.comparison,
    kpis: {
      delivered: buildKpi(currentTotals.ordersDelivered, compD),
      entered: buildKpi(currentTotals.ordersEntered, compE),
      returned: buildKpi(currentTotals.ordersReturned, compR),
      deliveryRate: buildRateKpi(currentDeliveryRate, compDeliveryRate),
      deliveryRateOperational: buildRateKpi(
        currentDeliveryRateOp,
        compDeliveryRateOp,
      ),
    },
    currentSeries: input.currentSeries,
    comparisonSeries: input.comparisonSeries,
    topEntered: input.topEntered,
    topDelivered: input.topDelivered,
    memberRows: input.memberRows,
    available: input.available,
  };
}

// ─── Mensual / cohortes ────────────────────────────────────────────────────

// Carga el Radar (motor mensual) para el mes seleccionado. Es la misma capa
// que usa /radar; la reusamos para que las cohortes tengan los segmentos y
// deltas ya calculados.
export async function loadMonthlyRadar(
  monthlyKeyStr: string | null,
  periods: PeriodMonthly[],
): Promise<{ radar: Radar | null; available: PeriodMonthly[]; current: PeriodMonthly | null }> {
  if (periods.length === 0) {
    return { radar: null, available: periods, current: null };
  }
  const current =
    findMonthlyByKey(periods, monthlyKeyStr ?? null) ?? periods[0];
  const idx = periods.findIndex((p) => p.key === current.key);
  const previous = idx + 1 < periods.length ? periods[idx + 1] : null;

  const [currentMetrics, previousMetrics] = await Promise.all([
    prisma.dropiMonthlyMetric.findMany({
      where: { year: current.year, month: current.month },
      select: {
        memberId: true,
        ordersEntered: true,
        ordersMoved: true,
        ordersDelivered: true,
        ordersReturned: true,
        member: { select: COMMON_MEMBER_SELECT },
      },
    }),
    previous
      ? prisma.dropiMonthlyMetric.findMany({
          where: { year: previous.year, month: previous.month },
          select: {
            memberId: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const previousByMember = new Map<string, RadarOrderTotals>();
  for (const m of previousMetrics) {
    previousByMember.set(m.memberId, {
      ordersEntered: m.ordersEntered,
      ordersMoved: m.ordersMoved,
      ordersDelivered: m.ordersDelivered,
      ordersReturned: m.ordersReturned,
    });
  }
  const currentIds = new Set(currentMetrics.map((m) => m.memberId));
  const previousOnly = [...previousByMember.keys()].filter(
    (id) => !currentIds.has(id),
  );
  const previousOnlyMeta = previousOnly.length
    ? await prisma.dropiCommunityMember.findMany({
        where: { id: { in: previousOnly } },
        select: COMMON_MEMBER_SELECT,
      })
    : [];

  const members: RadarMemberInput[] = [];
  for (const m of currentMetrics) {
    members.push({
      id: m.member.id,
      fullName: m.member.fullName,
      email: m.member.email,
      phone: m.member.phone,
      country: m.member.country,
      currentSegment: m.member.currentSegment,
      currentPriority: m.member.currentPriority,
      currentStatus: m.member.currentStatus,
      linkedStudentId: m.member.linkedStudentId,
      current: {
        ordersEntered: m.ordersEntered,
        ordersMoved: m.ordersMoved,
        ordersDelivered: m.ordersDelivered,
        ordersReturned: m.ordersReturned,
      },
      previous: previousByMember.get(m.memberId) ?? null,
    });
  }
  for (const m of previousOnlyMeta) {
    members.push({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      country: m.country,
      currentSegment: m.currentSegment,
      currentPriority: m.currentPriority,
      currentStatus: m.currentStatus,
      linkedStudentId: m.linkedStudentId,
      current: { ...ZERO_TOTALS },
      previous: previousByMember.get(m.id) ?? null,
    });
  }

  const radar = buildRadar({
    current: { year: current.year, month: current.month },
    previous: previous ? { year: previous.year, month: previous.month } : null,
    members,
  });
  return { radar, available: periods, current };
}

export async function listMonthlyPeriodsForUi(): Promise<PeriodMonthly[]> {
  return listMonthlyPeriods();
}
