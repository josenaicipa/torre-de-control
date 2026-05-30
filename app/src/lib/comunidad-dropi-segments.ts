// Segmentation + priority engine. Stays pure (no Prisma calls) so it can be
// unit-tested and reused for both weekly and monthly passes. Thresholds are
// hard-coded for Release 1; in Release 2 they should move to a config table
// per the blueprint.

export type DropiSegment =
  | "ZERO_SALES"
  | "NEW_SELLER"
  | "LOW_VOLUME"
  | "GROWING"
  | "DROPPING"
  | "HIGH_RETURN_RISK"
  | "RECOVERED"
  | "TOP_PERFORMER"
  | "STABLE";

export type DropiPriorityCode = "P1" | "P2" | "P3" | "P4";

export interface DropiSegmentInput {
  ordersEntered: number;
  ordersDelivered?: number;
  ordersReturned?: number;
  returnRate?: number;
  previousOrdersEntered?: number | null;
  isFirstPeriodSeen?: boolean;
}

export interface DropiSegmentResult {
  segment: DropiSegment;
  priority: DropiPriorityCode;
  deltaOrders: number | null;
  deltaPercent: number | null;
  trend: "UP" | "DOWN" | "STABLE" | "NEW" | "ZERO";
}

// Blueprint defaults — section 6.3/6.4. Keep these here as named exports so a
// future configuration UI can replace them without touching call sites.
export const DROPI_THRESHOLDS = {
  lowVolumeMaxOrders: 5,
  topPerformerMinOrders: 50,
  growingDeltaPct: 25,
  droppingDeltaPct: -25,
  highReturnPct: 30,
  recoveredMinOrders: 3,
};

export function calculateSegment(input: DropiSegmentInput): DropiSegmentResult {
  const entered = input.ordersEntered ?? 0;
  const previous = input.previousOrdersEntered ?? null;
  const returnRate = input.returnRate ?? 0;
  const isFirst = Boolean(input.isFirstPeriodSeen);

  const { deltaOrders, deltaPercent } = computeDelta(entered, previous);
  const trend = computeTrend(entered, previous, isFirst);

  let segment: DropiSegment;
  if (entered <= 0) {
    segment = "ZERO_SALES";
  } else if (returnRate >= DROPI_THRESHOLDS.highReturnPct) {
    segment = "HIGH_RETURN_RISK";
  } else if (isFirst) {
    segment = "NEW_SELLER";
  } else if (
    previous != null &&
    previous <= 0 &&
    entered >= DROPI_THRESHOLDS.recoveredMinOrders
  ) {
    segment = "RECOVERED";
  } else if (entered >= DROPI_THRESHOLDS.topPerformerMinOrders) {
    segment = "TOP_PERFORMER";
  } else if (
    deltaPercent != null &&
    deltaPercent <= DROPI_THRESHOLDS.droppingDeltaPct
  ) {
    segment = "DROPPING";
  } else if (
    deltaPercent != null &&
    deltaPercent >= DROPI_THRESHOLDS.growingDeltaPct
  ) {
    segment = "GROWING";
  } else if (entered <= DROPI_THRESHOLDS.lowVolumeMaxOrders) {
    segment = "LOW_VOLUME";
  } else {
    segment = "STABLE";
  }

  const priority = priorityFor(segment, entered, returnRate);

  return { segment, priority, deltaOrders, deltaPercent, trend };
}

function computeDelta(
  current: number,
  previous: number | null,
): { deltaOrders: number | null; deltaPercent: number | null } {
  if (previous == null) {
    return { deltaOrders: null, deltaPercent: null };
  }
  const delta = current - previous;
  if (previous === 0) {
    if (current === 0) return { deltaOrders: 0, deltaPercent: 0 };
    return { deltaOrders: delta, deltaPercent: null };
  }
  const pct = (delta / previous) * 100;
  return {
    deltaOrders: delta,
    deltaPercent: Math.round(pct * 100) / 100,
  };
}

function computeTrend(
  current: number,
  previous: number | null,
  isFirst: boolean,
): DropiSegmentResult["trend"] {
  if (isFirst && current > 0) return "NEW";
  if (current === 0) return "ZERO";
  if (previous == null) return "STABLE";
  if (current > previous) return "UP";
  if (current < previous) return "DOWN";
  return "STABLE";
}

function priorityFor(
  segment: DropiSegment,
  entered: number,
  returnRate: number,
): DropiPriorityCode {
  switch (segment) {
    case "DROPPING":
      return "P1";
    case "HIGH_RETURN_RISK":
      return returnRate >= 50 ? "P1" : "P2";
    case "ZERO_SALES":
      return entered === 0 ? "P2" : "P3";
    case "LOW_VOLUME":
    case "NEW_SELLER":
      return "P2";
    case "TOP_PERFORMER":
      return "P4";
    case "RECOVERED":
    case "GROWING":
    case "STABLE":
    default:
      return "P3";
  }
}

// Map segments to the follow-up reason the engine should open when the segment
// is detected. Returning null means "no auto follow-up needed".
export function followUpReasonForSegment(
  segment: DropiSegment,
):
  | "ZERO_SALES"
  | "DROP"
  | "HIGH_RETURN"
  | "LOW_VOLUME"
  | "TOP_PERFORMER"
  | null {
  switch (segment) {
    case "ZERO_SALES":
      return "ZERO_SALES";
    case "DROPPING":
      return "DROP";
    case "HIGH_RETURN_RISK":
      return "HIGH_RETURN";
    case "LOW_VOLUME":
      return "LOW_VOLUME";
    case "TOP_PERFORMER":
      return "TOP_PERFORMER";
    default:
      return null;
  }
}

export const DROPI_SEGMENT_LABELS: Record<DropiSegment, string> = {
  ZERO_SALES: "Sin ventas",
  NEW_SELLER: "Nuevo vendedor",
  LOW_VOLUME: "Bajo volumen",
  GROWING: "Creciendo",
  DROPPING: "En caída",
  HIGH_RETURN_RISK: "Devoluciones altas",
  RECOVERED: "Recuperado",
  TOP_PERFORMER: "Mejor vendedor",
  STABLE: "Estable",
};

export const DROPI_PRIORITY_LABELS: Record<DropiPriorityCode, string> = {
  P1: "P1 · Urgente",
  P2: "P2 · Importante",
  P3: "P3 · Seguimiento",
  P4: "P4 · Caso éxito",
};
