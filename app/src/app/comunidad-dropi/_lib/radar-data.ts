// Server-side loader for the Comunidad Dropi Radar de Rendimiento.
// Pulls monthly metrics from Prisma, builds the `Radar` analytics object from
// `comunidad-dropi-radar.ts`, and exposes the list of months available so the
// UI can let the operator switch between cierres mensuales.

import { prisma } from "@/lib/prisma";
import {
  buildRadar,
  type Radar,
  type RadarMemberInput,
  type RadarOrderTotals,
} from "@/lib/comunidad-dropi-radar";

const ZERO_TOTALS: RadarOrderTotals = {
  ordersEntered: 0,
  ordersMoved: 0,
  ordersDelivered: 0,
  ordersReturned: 0,
};

export interface AvailableMonth {
  year: number;
  month: number;
  metricCount: number;
}

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

export function formatMonthRef(ref: { year: number; month: number }): string {
  const idx = Math.max(0, Math.min(11, ref.month - 1));
  return `${SPANISH_MONTHS[idx]} ${ref.year}`;
}

export async function listAvailableMonths(): Promise<AvailableMonth[]> {
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

export interface RadarLoadInput {
  year?: number;
  month?: number;
}

export interface RadarLoadResult {
  radar: Radar | null;
  available: AvailableMonth[];
  // Última importación confirmada en cualquier estado terminal. Sirve para el
  // bloque de calidad de datos: si pasó mucho tiempo, el Pulso puede estar
  // desactualizado y conviene avisarlo.
  lastImportAt: Date | null;
}

export async function loadRadar(
  input: RadarLoadInput = {},
): Promise<RadarLoadResult> {
  const [available, lastImport] = await Promise.all([
    listAvailableMonths(),
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

  const [currentMetrics, previousMetrics] = await Promise.all([
    prisma.dropiMonthlyMetric.findMany({
      where: { year: currentRef.year, month: currentRef.month },
      include: { member: true },
    }),
    previousRef
      ? prisma.dropiMonthlyMetric.findMany({
          where: { year: previousRef.year, month: previousRef.month },
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
