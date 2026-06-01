// Server-side loader for the Comunidad Dropi Radar de Rendimiento.
// Pulls monthly metrics from Prisma, builds the `Radar` analytics object from
// `comunidad-dropi-radar.ts`, and exposes la lista de meses disponibles para
// que el UI permita cambiar de cierre mensual.
//
// Para que cambiar entre /radar /rankings /segmentos no recalcule todo en
// cada navegación, las lecturas pesadas viven detrás de un memo en proceso
// con TTL corto. El confirm de importación llama `bustRadarCache()` para
// invalidarlo y disparar `revalidatePath` en las páginas afectadas.
//
// El memo se hace en proceso (no Next `unstable_cache`) porque Next
// serializa el valor cacheado vía JSON y eso convierte los `Date` (por
// ejemplo `lastImportAt`, `periodStart`) a strings; preferimos preservar
// los tipos.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  buildRadar,
  type Radar,
  type RadarMemberInput,
  type RadarOrderTotals,
} from "@/lib/comunidad-dropi-radar";
import {
  buildWeeklyPulseSummary,
  type WeeklyPulseSummary,
} from "./weekly-pulse";
import {
  AVAILABLE_MONTHS_CACHE_KEY,
  clearRadarCache,
  formatMonthRef,
  memoRadar,
  radarCacheKey,
  WEEKLY_PULSE_CACHE_KEY,
} from "./radar-cache";

export { formatMonthRef, radarCacheKey, WEEKLY_PULSE_CACHE_KEY };

const ZERO_TOTALS: RadarOrderTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

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

export interface AvailableMonth {
  year: number;
  month: number;
  metricCount: number;
}

export interface RadarLoadInput {
  year?: number;
  month?: number;
}

export interface RadarLoadResult {
  radar: Radar | null;
  available: AvailableMonth[];
  // Última importación confirmada en cualquier estado terminal. Sirve para
  // el bloque de calidad de datos: si pasó mucho tiempo, el Pulso puede
  // estar desactualizado y conviene avisarlo.
  lastImportAt: Date | null;
}

async function listAvailableMonthsRaw(): Promise<AvailableMonth[]> {
  const grouped = await prisma.dropiMonthlyMetric.groupBy({
    by: ["year", "month"],
    _count: { _all: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return grouped.map((g) => ({
    year: g.year,
    month: g.month,
    metricCount: g._count._all,
  }));
}

export async function listAvailableMonths(): Promise<AvailableMonth[]> {
  return memoRadar(AVAILABLE_MONTHS_CACHE_KEY, listAvailableMonthsRaw);
}

async function loadRadarUncached(
  input: RadarLoadInput,
): Promise<RadarLoadResult> {
  const [available, lastImport] = await Promise.all([
    memoRadar(AVAILABLE_MONTHS_CACHE_KEY, listAvailableMonthsRaw),
    prisma.dropiImportBatch.findFirst({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  const lastImportAt = lastImport?.updatedAt ?? null;
  if (available.length === 0) {
    return { radar: null, available, lastImportAt };
  }

  let currentRef = available[0];
  if (
    input.year != null &&
    input.month != null &&
    Number.isFinite(input.year) &&
    Number.isFinite(input.month)
  ) {
    const found = available.find(
      (a) => a.year === input.year && a.month === input.month,
    );
    if (found) currentRef = found;
  }
  const currentIdx = available.findIndex(
    (a) => a.year === currentRef.year && a.month === currentRef.month,
  );
  const previousRef =
    currentIdx >= 0 && currentIdx + 1 < available.length
      ? available[currentIdx + 1]
      : null;

  // El `select` reemplaza a `include: { member: true }` para no traer
  // campos pesados (notes, timestamps internos) que el Pulso no usa.
  // Reduce el payload Prisma → JS notablemente cuando hay muchos miembros.
  const [currentMetrics, previousMetrics] = await Promise.all([
    prisma.dropiMonthlyMetric.findMany({
      where: { year: currentRef.year, month: currentRef.month },
      select: {
        memberId: true,
        ordersEntered: true,
        ordersMoved: true,
        ordersDelivered: true,
        ordersReturned: true,
        member: { select: COMMON_MEMBER_SELECT },
      },
    }),
    previousRef
      ? prisma.dropiMonthlyMetric.findMany({
          where: { year: previousRef.year, month: previousRef.month },
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

  const currentMemberIds = new Set(currentMetrics.map((m) => m.memberId));
  const previousOnlyIds = [...previousByMember.keys()].filter(
    (id) => !currentMemberIds.has(id),
  );
  const previousOnlyMembers = previousOnlyIds.length
    ? await prisma.dropiCommunityMember.findMany({
        where: { id: { in: previousOnlyIds } },
        select: COMMON_MEMBER_SELECT,
      })
    : [];

  const members: RadarMemberInput[] = [];
  for (const m of currentMetrics) {
    const prev = previousByMember.get(m.memberId);
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
      previous: prev ?? null,
    });
  }
  for (const m of previousOnlyMembers) {
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
    current: { year: currentRef.year, month: currentRef.month },
    previous: previousRef
      ? { year: previousRef.year, month: previousRef.month }
      : null,
    members,
  });
  return { radar, available, lastImportAt };
}

export async function loadRadar(
  input: RadarLoadInput = {},
): Promise<RadarLoadResult> {
  return memoRadar(radarCacheKey(input), () => loadRadarUncached(input));
}

// ─── Pulso semanal disponible ──────────────────────────────────────────────
//
// Dato parcial honesto: si hay al menos una ventana semanal cargada, el
// Pulso puede mostrarla como "Pulso semanal disponible" mientras se cierra
// el mensual. Nunca se mezcla con el cierre mensual ni se hacen
// comparaciones cruzadas — solo se reporta la ventana real con su delta vs
// la inmediata anterior.

async function loadWeeklyPulseUncached(): Promise<WeeklyPulseSummary | null> {
  const recent = await prisma.dropiWeeklyMetric.groupBy({
    by: ["periodStart", "periodEnd"],
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    take: 2,
  });
  if (recent.length === 0) return null;

  const latest = recent[0];
  const previous = recent[1] ?? null;

  const [currentRows, previousRows] = await Promise.all([
    prisma.dropiWeeklyMetric.findMany({
      where: {
        periodStart: latest.periodStart,
        periodEnd: latest.periodEnd,
      },
      select: {
        memberId: true,
        ordersEntered: true,
        ordersMoved: true,
        ordersDelivered: true,
        ordersReturned: true,
      },
    }),
    previous
      ? prisma.dropiWeeklyMetric.findMany({
          where: {
            periodStart: previous.periodStart,
            periodEnd: previous.periodEnd,
          },
          select: {
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return buildWeeklyPulseSummary({
    period: { periodStart: latest.periodStart, periodEnd: latest.periodEnd },
    previousPeriod: previous
      ? { periodStart: previous.periodStart, periodEnd: previous.periodEnd }
      : null,
    currentRows,
    previousRows,
  });
}

export async function loadWeeklyPulse(): Promise<WeeklyPulseSummary | null> {
  return memoRadar(WEEKLY_PULSE_CACHE_KEY, loadWeeklyPulseUncached);
}

// Vacía todo el estado memoizado por el Pulso e invalida los paths que lo
// renderizan para que la siguiente navegación lea Prisma fresco sin
// esperar al TTL del memo.
export function bustRadarCache(): void {
  clearRadarCache();
  revalidatePath("/comunidad-dropi/radar");
  revalidatePath("/comunidad-dropi/rankings");
  revalidatePath("/comunidad-dropi/segmentos");
}
