// Comunidad Dropi — Radar de Rendimiento Mensual.
//
// Pure analytics layer (no Prisma) so it stays unit-testable. Callers prepare
// the monthly slice for each Miembro Dropi and pass plain shapes in. The
// resulting `Radar` is consumed by the CEO/operativa pages: KPIs, ranking,
// segmentación automática y top miembros por segmento.
//
// Reglas del producto:
//   - Entregadas (ordersDelivered) es la métrica reina.
//   - Ingresadas siempre se muestra como secundaria.
//   - Se compara mes cerrado actual vs. mes cerrado anterior.
//   - tasaEntrega = entregadas / ingresadas (no entregadas / movidas).
//   - tasaDevolucion = devoluciones / ingresadas.
//   - "Miembro Dropi", nunca "estudiante" — no fusionar con Operaciones.

export type RadarSegment =
  | "STAR"
  | "GROWING"
  | "DROPPING"
  | "STABLE"
  | "HIGH_RETURN"
  | "RECOVERED"
  | "INACTIVE"
  | "NEW";

export const RADAR_SEGMENT_LABELS: Record<RadarSegment, string> = {
  STAR: "Estrella",
  GROWING: "Creciendo",
  DROPPING: "Decreciendo",
  STABLE: "Estable",
  HIGH_RETURN: "Devoluciones altas",
  RECOVERED: "Recuperado",
  INACTIVE: "Inactivo",
  NEW: "Nuevo",
};

export const RADAR_SEGMENT_COLORS: Record<RadarSegment, { bg: string; text: string }> = {
  STAR: { bg: "#FAE8FF", text: "#86198F" },
  GROWING: { bg: "#DCFCE7", text: "#166534" },
  DROPPING: { bg: "#FEE2E2", text: "#991B1B" },
  STABLE: { bg: "#F1F5F9", text: "#475569" },
  HIGH_RETURN: { bg: "#FFE4E6", text: "#9F1239" },
  RECOVERED: { bg: "#E0E7FF", text: "#3730A3" },
  INACTIVE: { bg: "#FEF3C7", text: "#92400E" },
  NEW: { bg: "#E0F2FE", text: "#075985" },
};

export interface RadarOrderTotals {
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
}

export interface RadarMemberInput {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  currentSegment?: string | null;
  currentPriority?: string | null;
  currentStatus?: "ACTIVE" | "INACTIVE" | "WATCHLIST" | null;
  linkedStudentId?: string | null;
  current: RadarOrderTotals;
  previous: RadarOrderTotals | null;
}

export interface RadarKpi {
  current: number;
  previous: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
}

export interface RadarRateKpi {
  current: number;
  previous: number | null;
}

export interface RadarKpis {
  delivered: RadarKpi;
  entered: RadarKpi;
  moved: RadarKpi;
  returned: RadarKpi;
  deliveryRate: RadarRateKpi;
  returnRate: RadarRateKpi;
  activeMembers: { current: number; previous: number | null };
  totalMembers: number;
}

export interface RadarMember {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  currentSegment: string | null;
  currentPriority: string | null;
  currentStatus: "ACTIVE" | "INACTIVE" | "WATCHLIST" | null;
  linkedStudentId: string | null;
  current: RadarOrderTotals;
  previous: RadarOrderTotals | null;
  deliveryRate: number;
  returnRate: number;
  deliveredDelta: number | null;
  deliveredDeltaPct: number | null;
  enteredDelta: number | null;
  enteredDeltaPct: number | null;
  starScore: number;
  segment: RadarSegment;
  reason: string;
}

export interface RadarSegmentBucket {
  segment: RadarSegment;
  label: string;
  memberCount: number;
  share: number;
  topMembers: RadarMember[];
}

export interface RadarMonthRef {
  year: number;
  month: number;
}

export interface Radar {
  current: RadarMonthRef;
  previous: RadarMonthRef | null;
  kpis: RadarKpis;
  members: RadarMember[];
  segmentBuckets: RadarSegmentBucket[];
}

export type RadarRankingCriterion =
  | "STAR_SCORE"
  | "DELIVERED"
  | "ENTERED"
  | "DELIVERY_RATE"
  | "RETURNS"
  | "GROWTH"
  | "DECLINE";

export const RADAR_RANKING_CRITERIA: RadarRankingCriterion[] = [
  "STAR_SCORE",
  "DELIVERED",
  "ENTERED",
  "DELIVERY_RATE",
  "RETURNS",
  "GROWTH",
  "DECLINE",
];

export const RADAR_RANKING_LABELS: Record<RadarRankingCriterion, string> = {
  STAR_SCORE: "Score estrella",
  DELIVERED: "Más entregadas",
  ENTERED: "Más ingresadas",
  DELIVERY_RATE: "Mejor tasa de entrega",
  RETURNS: "Más devoluciones",
  GROWTH: "Mayor crecimiento",
  DECLINE: "Mayor caída",
};

// Umbrales del radar — documentados en blueprint sección 6.
// Un miembro con devolución >= 25% nunca debe aparecer como Estrella.
const HIGH_RETURN_THRESHOLD = 25;
// Volumen mínimo absoluto para considerar a alguien Estrella; evita que un
// miembro con pocas entregas pero crecimiento porcentual alto entre al podio.
const STAR_MIN_DELIVERED = 50;
// Corte de score estrella sobre 100 — combinación de cuatro percentiles.
const STAR_SCORE_THRESHOLD = 80;
// Banda STABLE: ±10% en entregadas vs. mes anterior.
const GROWING_DELTA_PCT = 10;
const DROPPING_DELTA_PCT = -10;

const STAR_WEIGHTS = {
  delivered: 0.4,
  growth: 0.25,
  lowReturn: 0.2,
  deliveryRate: 0.15,
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// Porcentaje seguro: denominador 0 ⇒ 0 (no NaN, no Infinity).
function safePct(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return round2((num / den) * 100);
}

// Rank percentile en escala [0, 100]. Empates se promedian para no inflar.
function rankPercentile(values: number[], target: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return 100;
  const sorted = [...values].sort((a, b) => a - b);
  let firstIdx = -1;
  let lastIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] === target) {
      if (firstIdx < 0) firstIdx = i;
      lastIdx = i;
    }
  }
  if (firstIdx < 0) {
    let below = 0;
    for (const v of sorted) if (v < target) below++;
    return (below / (sorted.length - 1)) * 100;
  }
  const idx = (firstIdx + lastIdx) / 2;
  return (idx / (sorted.length - 1)) * 100;
}

export function computeStarScore(input: {
  percentileDelivered: number;
  percentileGrowth: number;
  percentileLowReturn: number;
  percentileDeliveryRate: number;
}): number {
  const score =
    STAR_WEIGHTS.delivered * input.percentileDelivered +
    STAR_WEIGHTS.growth * input.percentileGrowth +
    STAR_WEIGHTS.lowReturn * input.percentileLowReturn +
    STAR_WEIGHTS.deliveryRate * input.percentileDeliveryRate;
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, round2(score)));
}

function hasActivity(t: RadarOrderTotals): boolean {
  return (
    t.ordersEntered > 0 ||
    t.ordersMoved > 0 ||
    t.ordersDelivered > 0 ||
    t.ordersReturned > 0
  );
}

function buildKpi(curr: number, prev: number | null): RadarKpi {
  if (prev == null) {
    return { current: curr, previous: null, deltaAbs: null, deltaPct: null };
  }
  const deltaAbs = curr - prev;
  let deltaPct: number | null;
  if (prev === 0) {
    deltaPct = curr === 0 ? 0 : null;
  } else {
    deltaPct = round2((deltaAbs / prev) * 100);
  }
  return { current: curr, previous: prev, deltaAbs, deltaPct };
}

interface ClassifyInput {
  current: RadarOrderTotals;
  previous: RadarOrderTotals | null;
  deliveryRate: number;
  returnRate: number;
  deliveredDelta: number | null;
  deliveredDeltaPct: number | null;
  starScore: number;
}

function classifySegment(s: ClassifyInput): { segment: RadarSegment; reason: string } {
  const curActive = hasActivity(s.current);
  const prevActive = s.previous != null && hasActivity(s.previous);

  if (!curActive && prevActive) {
    return {
      segment: "INACTIVE",
      reason: "Quedó inactivo este mes: tenía actividad el mes anterior y no registró entregas ni ingresos.",
    };
  }

  if (curActive && s.previous == null) {
    return {
      segment: "NEW",
      reason: "Nuevo miembro: primera ventana con actividad registrada.",
    };
  }

  if (
    curActive &&
    s.previous != null &&
    s.previous.ordersDelivered === 0 &&
    s.current.ordersDelivered > 0
  ) {
    return {
      segment: "RECOVERED",
      reason: `Se recuperó: pasó de cero entregas el mes anterior a ${s.current.ordersDelivered} este mes.`,
    };
  }

  if (s.returnRate >= HIGH_RETURN_THRESHOLD) {
    return {
      segment: "HIGH_RETURN",
      reason: `Tasa de devolución alta (${s.returnRate}%) sobre ${s.current.ordersEntered} ingresadas: el volumen no compensa el riesgo.`,
    };
  }

  if (
    s.current.ordersDelivered >= STAR_MIN_DELIVERED &&
    s.returnRate < HIGH_RETURN_THRESHOLD &&
    s.starScore >= STAR_SCORE_THRESHOLD
  ) {
    const growthBit =
      s.deliveredDeltaPct != null && s.deliveredDeltaPct > 0
        ? ` y +${s.deliveredDeltaPct}% vs. mes anterior`
        : "";
    return {
      segment: "STAR",
      reason: `Estrella: ${s.current.ordersDelivered} entregadas con devolución sana (${s.returnRate}%)${growthBit}.`,
    };
  }

  if (s.deliveredDeltaPct != null) {
    if (s.deliveredDeltaPct > GROWING_DELTA_PCT) {
      return {
        segment: "GROWING",
        reason: `Creciendo: entregadas suben ${s.deliveredDeltaPct}% vs. mes anterior (${s.current.ordersDelivered} este mes).`,
      };
    }
    if (s.deliveredDeltaPct < DROPPING_DELTA_PCT) {
      return {
        segment: "DROPPING",
        reason: `Decreciendo: entregadas bajan ${s.deliveredDeltaPct}% vs. mes anterior.`,
      };
    }
  } else if (s.deliveredDelta != null && s.deliveredDelta > 0) {
    return {
      segment: "GROWING",
      reason: `Creciendo: entregadas pasan de 0 a ${s.current.ordersDelivered} este mes.`,
    };
  }

  return {
    segment: "STABLE",
    reason: `Mes estable: ${s.current.ordersDelivered} entregadas, sin variación material vs. mes anterior.`,
  };
}

interface RadarBuildInput {
  current: RadarMonthRef;
  previous: RadarMonthRef | null;
  members: readonly RadarMemberInput[];
}

export function buildRadar(input: RadarBuildInput): Radar {
  const members = input.members;

  const rawStats = members.map((m) => {
    const cur = m.current;
    const prev = m.previous;
    const deliveryRate = safePct(cur.ordersDelivered, cur.ordersEntered);
    const returnRate = safePct(cur.ordersReturned, cur.ordersEntered);
    const deliveredDelta =
      prev != null ? cur.ordersDelivered - prev.ordersDelivered : null;
    let deliveredDeltaPct: number | null = null;
    if (prev != null) {
      if (prev.ordersDelivered === 0) {
        deliveredDeltaPct = cur.ordersDelivered === 0 ? 0 : null;
      } else {
        deliveredDeltaPct = round2(
          ((cur.ordersDelivered - prev.ordersDelivered) / prev.ordersDelivered) *
            100,
        );
      }
    }
    const enteredDelta =
      prev != null ? cur.ordersEntered - prev.ordersEntered : null;
    let enteredDeltaPct: number | null = null;
    if (prev != null) {
      if (prev.ordersEntered === 0) {
        enteredDeltaPct = cur.ordersEntered === 0 ? 0 : null;
      } else {
        enteredDeltaPct = round2(
          ((cur.ordersEntered - prev.ordersEntered) / prev.ordersEntered) * 100,
        );
      }
    }
    return {
      input: m,
      deliveryRate,
      returnRate,
      deliveredDelta,
      deliveredDeltaPct,
      enteredDelta,
      enteredDeltaPct,
    };
  });

  const deliveredValues = rawStats.map((s) => s.input.current.ordersDelivered);
  const growthValues = rawStats.map((s) => s.deliveredDelta ?? 0);
  const returnRateValues = rawStats.map((s) => s.returnRate);
  const deliveryRateValues = rawStats.map((s) => s.deliveryRate);

  const enriched: RadarMember[] = rawStats.map((s) => {
    const m = s.input;
    const pDelivered = rankPercentile(deliveredValues, m.current.ordersDelivered);
    const pGrowth = rankPercentile(growthValues, s.deliveredDelta ?? 0);
    const pReturn = rankPercentile(returnRateValues, s.returnRate);
    const pLowReturn = 100 - pReturn;
    const pDeliveryRate = rankPercentile(deliveryRateValues, s.deliveryRate);

    const starScore = computeStarScore({
      percentileDelivered: pDelivered,
      percentileGrowth: pGrowth,
      percentileLowReturn: pLowReturn,
      percentileDeliveryRate: pDeliveryRate,
    });

    const { segment, reason } = classifySegment({
      current: m.current,
      previous: m.previous,
      deliveryRate: s.deliveryRate,
      returnRate: s.returnRate,
      deliveredDelta: s.deliveredDelta,
      deliveredDeltaPct: s.deliveredDeltaPct,
      starScore,
    });

    return {
      id: m.id,
      fullName: m.fullName ?? null,
      email: m.email ?? null,
      phone: m.phone ?? null,
      country: m.country ?? null,
      currentSegment: m.currentSegment ?? null,
      currentPriority: m.currentPriority ?? null,
      currentStatus: m.currentStatus ?? null,
      linkedStudentId: m.linkedStudentId ?? null,
      current: m.current,
      previous: m.previous,
      deliveryRate: s.deliveryRate,
      returnRate: s.returnRate,
      deliveredDelta: s.deliveredDelta,
      deliveredDeltaPct: s.deliveredDeltaPct,
      enteredDelta: s.enteredDelta,
      enteredDeltaPct: s.enteredDeltaPct,
      starScore,
      segment,
      reason,
    };
  });

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const curEntered = sum(members.map((m) => m.current.ordersEntered));
  const curMoved = sum(members.map((m) => m.current.ordersMoved));
  const curDelivered = sum(members.map((m) => m.current.ordersDelivered));
  const curReturned = sum(members.map((m) => m.current.ordersReturned));

  const hasPrev = members.some((m) => m.previous != null);
  let prevEntered: number | null = null;
  let prevMoved: number | null = null;
  let prevDelivered: number | null = null;
  let prevReturned: number | null = null;
  let prevActive: number | null = null;
  if (hasPrev) {
    prevEntered = sum(members.map((m) => m.previous?.ordersEntered ?? 0));
    prevMoved = sum(members.map((m) => m.previous?.ordersMoved ?? 0));
    prevDelivered = sum(members.map((m) => m.previous?.ordersDelivered ?? 0));
    prevReturned = sum(members.map((m) => m.previous?.ordersReturned ?? 0));
    prevActive = members.filter(
      (m) => m.previous != null && hasActivity(m.previous),
    ).length;
  }

  const kpis: RadarKpis = {
    delivered: buildKpi(curDelivered, prevDelivered),
    entered: buildKpi(curEntered, prevEntered),
    moved: buildKpi(curMoved, prevMoved),
    returned: buildKpi(curReturned, prevReturned),
    deliveryRate: {
      current: safePct(curDelivered, curEntered),
      previous: hasPrev ? safePct(prevDelivered ?? 0, prevEntered ?? 0) : null,
    },
    returnRate: {
      current: safePct(curReturned, curEntered),
      previous: hasPrev ? safePct(prevReturned ?? 0, prevEntered ?? 0) : null,
    },
    activeMembers: {
      current: members.filter((m) => hasActivity(m.current)).length,
      previous: prevActive,
    },
    totalMembers: members.length,
  };

  const bucketMap = new Map<RadarSegment, RadarMember[]>();
  for (const m of enriched) {
    const arr = bucketMap.get(m.segment) ?? [];
    arr.push(m);
    bucketMap.set(m.segment, arr);
  }
  const totalForShare = members.length || 1;
  const segmentBuckets: RadarSegmentBucket[] = Array.from(bucketMap.entries())
    .map(([segment, ms]) => {
      const sorted = [...ms].sort(
        (a, b) => b.current.ordersDelivered - a.current.ordersDelivered,
      );
      return {
        segment,
        label: RADAR_SEGMENT_LABELS[segment],
        memberCount: ms.length,
        share: round2((ms.length / totalForShare) * 100),
        topMembers: sorted.slice(0, 5),
      };
    })
    .sort((a, b) => b.memberCount - a.memberCount);

  return {
    current: input.current,
    previous: input.previous,
    kpis,
    members: enriched,
    segmentBuckets,
  };
}

export function rankRadarMembers(
  members: readonly RadarMember[],
  criterion: RadarRankingCriterion,
): RadarMember[] {
  const arr = [...members];
  switch (criterion) {
    case "STAR_SCORE":
      arr.sort((a, b) => b.starScore - a.starScore);
      break;
    case "DELIVERED":
      arr.sort(
        (a, b) => b.current.ordersDelivered - a.current.ordersDelivered,
      );
      break;
    case "ENTERED":
      arr.sort(
        (a, b) => b.current.ordersEntered - a.current.ordersEntered,
      );
      break;
    case "DELIVERY_RATE":
      arr.sort((a, b) => b.deliveryRate - a.deliveryRate);
      break;
    case "RETURNS":
      arr.sort(
        (a, b) => b.current.ordersReturned - a.current.ordersReturned,
      );
      break;
    case "GROWTH":
      arr.sort(
        (a, b) =>
          (b.deliveredDelta ?? Number.NEGATIVE_INFINITY) -
          (a.deliveredDelta ?? Number.NEGATIVE_INFINITY),
      );
      break;
    case "DECLINE":
      arr.sort(
        (a, b) =>
          (a.deliveredDelta ?? Number.POSITIVE_INFINITY) -
          (b.deliveredDelta ?? Number.POSITIVE_INFINITY),
      );
      break;
  }
  return arr;
}
