import { describe, expect, it } from "vitest";
import {
  buildWeeklyPulseSummary,
  classifyWeeklyFreshness,
  daysSinceWeekEnd,
  formatWeeklyRange,
  STALE_WEEK_THRESHOLD_DAYS,
} from "./weekly-pulse";

describe("formatWeeklyRange", () => {
  it("formatea inicio → fin en ISO corto", () => {
    expect(
      formatWeeklyRange({
        periodStart: new Date("2026-05-04T00:00:00Z"),
        periodEnd: new Date("2026-05-10T00:00:00Z"),
      }),
    ).toBe("2026-05-04 → 2026-05-10");
  });
});

describe("daysSinceWeekEnd", () => {
  it("cuenta días enteros desde el cierre", () => {
    const end = new Date("2026-05-10T00:00:00Z");
    const now = new Date("2026-05-15T00:00:00Z");
    expect(daysSinceWeekEnd(end, now)).toBe(5);
  });
  it("nunca devuelve negativo si la ventana es futura", () => {
    const end = new Date("2026-05-15T00:00:00Z");
    const now = new Date("2026-05-10T00:00:00Z");
    expect(daysSinceWeekEnd(end, now)).toBe(0);
  });
});

describe("classifyWeeklyFreshness", () => {
  it("es fresh dentro del umbral", () => {
    const end = new Date("2026-05-10T00:00:00Z");
    const now = new Date(
      end.getTime() + STALE_WEEK_THRESHOLD_DAYS * 86_400_000,
    );
    expect(classifyWeeklyFreshness(end, now)).toBe("fresh");
  });
  it("es stale pasando el umbral", () => {
    const end = new Date("2026-05-10T00:00:00Z");
    const now = new Date(
      end.getTime() + (STALE_WEEK_THRESHOLD_DAYS + 1) * 86_400_000,
    );
    expect(classifyWeeklyFreshness(end, now)).toBe("stale");
  });
});

describe("buildWeeklyPulseSummary", () => {
  const period = {
    periodStart: new Date("2026-05-18T00:00:00Z"),
    periodEnd: new Date("2026-05-24T00:00:00Z"),
  };
  const previousPeriod = {
    periodStart: new Date("2026-05-11T00:00:00Z"),
    periodEnd: new Date("2026-05-17T00:00:00Z"),
  };

  it("suma totales y calcula delta vs semana previa", () => {
    const summary = buildWeeklyPulseSummary({
      period,
      previousPeriod,
      currentRows: [
        {
          memberId: "m1",
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 6,
          ordersReturned: 1,
        },
        {
          memberId: "m2",
          ordersEntered: 5,
          ordersMoved: 4,
          ordersDelivered: 4,
          ordersReturned: 0,
        },
      ],
      previousRows: [
        {
          memberId: "m1",
          ordersEntered: 8,
          ordersMoved: 6,
          ordersDelivered: 5,
          ordersReturned: 0,
        },
      ],
      now: new Date("2026-05-25T00:00:00Z"),
    });

    expect(summary.totals).toEqual({
      ordersEntered: 15,
      ordersMoved: 12,
      ordersDelivered: 10,
      ordersReturned: 1,
    });
    expect(summary.previousTotals).toEqual({
      ordersEntered: 8,
      ordersMoved: 6,
      ordersDelivered: 5,
      ordersReturned: 0,
    });
    expect(summary.deliveredDeltaPct).toBe(100);
    expect(summary.enteredDeltaPct).toBe(87.5);
    expect(summary.memberCount).toBe(2);
    expect(summary.freshness).toBe("fresh");
    expect(summary.daysSinceEnd).toBe(1);
    expect(summary.rangeLabel).toBe("2026-05-18 → 2026-05-24");
  });

  it("sin semana previa deja deltas en null y previousTotals null", () => {
    const summary = buildWeeklyPulseSummary({
      period,
      previousPeriod: null,
      currentRows: [
        {
          ordersEntered: 3,
          ordersMoved: 2,
          ordersDelivered: 1,
          ordersReturned: 0,
        },
      ],
      now: new Date("2026-05-25T00:00:00Z"),
    });
    expect(summary.previousTotals).toBeNull();
    expect(summary.deliveredDeltaPct).toBeNull();
    expect(summary.enteredDeltaPct).toBeNull();
    expect(summary.memberCount).toBe(0);
  });

  it("marca freshness stale si pasó el umbral", () => {
    const summary = buildWeeklyPulseSummary({
      period,
      previousPeriod: null,
      currentRows: [],
      now: new Date(
        period.periodEnd.getTime() +
          (STALE_WEEK_THRESHOLD_DAYS + 5) * 86_400_000,
      ),
    });
    expect(summary.freshness).toBe("stale");
  });

  it("previousTotals 0 → curr > 0 deja delta en null (no divide por cero)", () => {
    const summary = buildWeeklyPulseSummary({
      period,
      previousPeriod,
      currentRows: [
        {
          ordersEntered: 4,
          ordersMoved: 2,
          ordersDelivered: 2,
          ordersReturned: 0,
        },
      ],
      previousRows: [
        {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      ],
      now: new Date("2026-05-25T00:00:00Z"),
    });
    expect(summary.deliveredDeltaPct).toBeNull();
    expect(summary.enteredDeltaPct).toBeNull();
  });

  it("previousTotals 0 y curr 0 deja delta en 0", () => {
    const summary = buildWeeklyPulseSummary({
      period,
      previousPeriod,
      currentRows: [
        {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      ],
      previousRows: [
        {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      ],
      now: new Date("2026-05-25T00:00:00Z"),
    });
    expect(summary.deliveredDeltaPct).toBe(0);
    expect(summary.enteredDeltaPct).toBe(0);
  });
});
