// Capa pura (sin Prisma) para la sección "Rendimiento de la comunidad" del
// Radar. Toma las filas de métricas del período actual y de comparación y
// arma:
//   - la lista completa de miembros del período (no solo top), incluyendo a
//     quienes estaban en la comparación pero cayeron a 0 este período (para
//     que aparezcan en la cohorte de caída),
//   - Top 20 por entregas,
//   - En caída (deliveredDelta < 0, mayor pérdida absoluta primero),
//   - En aumento (deliveredDelta > 0, mayor crecimiento absoluto primero).
//
// Mantener acá la lógica de orden/derivación la hace testeable sin tocar la
// base de datos. El loader (`crecimiento-data.ts`) solo provee las filas.

import type { RadarOrderTotals } from "@/lib/comunidad-dropi-radar";

export interface MetricRow {
  memberId: string;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
}

export interface MemberMeta {
  fullName: string | null;
  country: string | null;
}

export interface MemberPeriodRow {
  id: string;
  fullName: string | null;
  country: string | null;
  current: RadarOrderTotals;
  comparison: RadarOrderTotals | null;
  deliveredDelta: number | null;
  deliveredDeltaPct: number | null;
}

const ZERO_TOTALS: RadarOrderTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// % de variación de entregadas vs. comparación. Null cuando no hay base
// comparable (sin comparación o comparación en 0): no se puede expresar como
// porcentaje sin inventar un denominador.
function deliveredPct(
  current: RadarOrderTotals,
  comparison: RadarOrderTotals | null,
): number | null {
  if (comparison == null) return null;
  const base = comparison.ordersDelivered;
  if (base <= 0) return null;
  return round2(((current.ordersDelivered - base) / base) * 100);
}

function aggregate(rows: readonly MetricRow[]): Map<string, RadarOrderTotals> {
  const map = new Map<string, RadarOrderTotals>();
  for (const r of rows) {
    const prev = map.get(r.memberId) ?? { ...ZERO_TOTALS };
    map.set(r.memberId, {
      ordersEntered: prev.ordersEntered + (r.ordersEntered ?? 0),
      ordersMoved: prev.ordersMoved + (r.ordersMoved ?? 0),
      ordersDelivered: prev.ordersDelivered + (r.ordersDelivered ?? 0),
      ordersReturned: prev.ordersReturned + (r.ordersReturned ?? 0),
    });
  }
  return map;
}

// Filas de TODOS los miembros del período: unión de quienes tienen actividad
// actual y quienes solo aparecen en la comparación (current = 0). Estos
// últimos son los que cayeron a cero y deben verse en "En caída".
export function buildAllMemberRows(
  currentRows: readonly MetricRow[],
  comparisonRows: readonly MetricRow[],
  meta: ReadonlyMap<string, MemberMeta>,
): MemberPeriodRow[] {
  const currentByMember = aggregate(currentRows);
  const comparisonByMember = aggregate(comparisonRows);
  const ids = new Set<string>([
    ...currentByMember.keys(),
    ...comparisonByMember.keys(),
  ]);

  const rows: MemberPeriodRow[] = [];
  for (const id of ids) {
    const current = currentByMember.get(id) ?? { ...ZERO_TOTALS };
    const comparison = comparisonByMember.get(id) ?? null;
    const m = meta.get(id);
    rows.push({
      id,
      fullName: m?.fullName ?? null,
      country: m?.country ?? null,
      current,
      comparison,
      deliveredDelta:
        comparison == null
          ? null
          : current.ordersDelivered - comparison.ordersDelivered,
      deliveredDeltaPct: deliveredPct(current, comparison),
    });
  }
  return rows;
}

// Top por entregas del período: orden descendente por entregadas actuales,
// máximo `limit`. Solo miembros con al menos una entrega.
export function topDeliveredRows(
  rows: readonly MemberPeriodRow[],
  limit = 20,
): MemberPeriodRow[] {
  return [...rows]
    .filter((r) => r.current.ordersDelivered > 0)
    .sort((a, b) => b.current.ordersDelivered - a.current.ordersDelivered)
    .slice(0, limit);
}

// En caída: deliveredDelta < 0. Orden por pérdida absoluta mayor primero;
// como desempate, el porcentaje de caída más fuerte.
export function decliningRows(
  rows: readonly MemberPeriodRow[],
): MemberPeriodRow[] {
  return [...rows]
    .filter((r) => r.deliveredDelta != null && r.deliveredDelta < 0)
    .sort((a, b) => {
      const da = Math.abs(a.deliveredDelta as number);
      const db = Math.abs(b.deliveredDelta as number);
      if (db !== da) return db - da;
      const pa = Math.abs(a.deliveredDeltaPct ?? 0);
      const pb = Math.abs(b.deliveredDeltaPct ?? 0);
      return pb - pa;
    });
}

// En aumento: deliveredDelta > 0. Orden por crecimiento absoluto mayor
// primero; desempate por mayor porcentaje de aumento.
export function risingRows(
  rows: readonly MemberPeriodRow[],
): MemberPeriodRow[] {
  return [...rows]
    .filter((r) => r.deliveredDelta != null && r.deliveredDelta > 0)
    .sort((a, b) => {
      const da = a.deliveredDelta as number;
      const db = b.deliveredDelta as number;
      if (db !== da) return db - da;
      const pa = a.deliveredDeltaPct ?? 0;
      const pb = b.deliveredDeltaPct ?? 0;
      return pb - pa;
    });
}
