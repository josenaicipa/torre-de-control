import { describe, expect, it } from "vitest";
import {
  buildBySegment,
  buildByCountry,
  buildFunnel,
  buildMemberDiagnostic,
  buildMonthlyTrend,
  buildOverview,
  buildWeeklyTrend,
  rankOpportunities,
  ratesFromTotals,
  safeDelta,
  safePercent,
  scoreOpportunity,
  sumTotals,
  weightedRates,
} from "./comunidad-dropi-analytics";

describe("safePercent", () => {
  it("returns 0 when denominator is zero", () => {
    expect(safePercent(5, 0)).toBe(0);
  });

  it("returns 0 when denominator is negative", () => {
    expect(safePercent(5, -3)).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(safePercent(1, 3)).toBe(33.33);
  });

  it("caps at 100", () => {
    expect(safePercent(200, 100)).toBe(100);
  });

  it("returns 0 when numerator is negative", () => {
    expect(safePercent(-5, 100)).toBe(0);
  });

  it("ignores non-finite values", () => {
    expect(safePercent(Number.NaN, 10)).toBe(0);
    expect(safePercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("safeDelta", () => {
  it("returns null when previous is null", () => {
    expect(safeDelta(10, null)).toEqual({ abs: null, pct: null });
  });

  it("returns null pct on 0 → positive", () => {
    expect(safeDelta(5, 0)).toEqual({ abs: 5, pct: null });
  });

  it("returns 0/0 percent when both are zero", () => {
    expect(safeDelta(0, 0)).toEqual({ abs: 0, pct: 0 });
  });

  it("computes signed percentage", () => {
    expect(safeDelta(12, 10)).toEqual({ abs: 2, pct: 20 });
    expect(safeDelta(6, 12)).toEqual({ abs: -6, pct: -50 });
  });
});

describe("sumTotals + weightedRates + ratesFromTotals", () => {
  const rows = [
    { ordersEntered: 100, ordersMoved: 80, ordersDelivered: 60, ordersReturned: 10 },
    { ordersEntered: 50, ordersMoved: 40, ordersDelivered: 35, ordersReturned: 5 },
  ];

  it("sums totals correctly", () => {
    expect(sumTotals(rows)).toEqual({
      ordersEntered: 150,
      ordersMoved: 120,
      ordersDelivered: 95,
      ordersReturned: 15,
    });
  });

  it("returns zero totals for empty input", () => {
    expect(sumTotals([])).toEqual({
      ordersEntered: 0,
      ordersMoved: 0,
      ordersDelivered: 0,
      ordersReturned: 0,
    });
  });

  it("computes weighted rates as moved/entered, delivered/moved, returned/moved", () => {
    const rates = weightedRates(rows);
    // 120/150 = 80
    expect(rates.movementRate).toBe(80);
    // 95/120 = 79.17
    expect(rates.deliveryRate).toBe(79.17);
    // 15/120 = 12.5
    expect(rates.returnRate).toBe(12.5);
  });

  it("treats zero divisors as zero rates", () => {
    const rates = ratesFromTotals({
      ordersEntered: 0,
      ordersMoved: 0,
      ordersDelivered: 0,
      ordersReturned: 0,
    });
    expect(rates).toEqual({ movementRate: 0, deliveryRate: 0, returnRate: 0 });
  });
});

describe("buildFunnel", () => {
  it("builds the four stages with shares and step conversions", () => {
    const stages = buildFunnel({
      ordersEntered: 100,
      ordersMoved: 80,
      ordersDelivered: 60,
      ordersReturned: 16,
    });
    expect(stages.map((s) => s.key)).toEqual([
      "entered",
      "moved",
      "delivered",
      "returned",
    ]);
    expect(stages[0]).toMatchObject({
      value: 100,
      shareOfEntered: 100,
      conversionFromPrev: null,
    });
    // moved: 80/100
    expect(stages[1].shareOfEntered).toBe(80);
    expect(stages[1].conversionFromPrev).toBe(80);
    // delivered: share 60/100, conversion 60/80
    expect(stages[2].shareOfEntered).toBe(60);
    expect(stages[2].conversionFromPrev).toBe(75);
    // returned measured over moved: 16/80 = 20, share 16/100 = 16
    expect(stages[3].shareOfEntered).toBe(16);
    expect(stages[3].conversionFromPrev).toBe(20);
  });

  it("keeps shares at zero when there are no entered orders", () => {
    const stages = buildFunnel({
      ordersEntered: 0,
      ordersMoved: 0,
      ordersDelivered: 0,
      ordersReturned: 0,
    });
    expect(stages.every((s) => s.shareOfEntered === 0)).toBe(true);
    expect(stages[0].conversionFromPrev).toBeNull();
  });
});

describe("buildOverview", () => {
  const members = [
    {
      currentSegment: "TOP_PERFORMER",
      currentPriority: "P4" as const,
      currentStatus: "ACTIVE" as const,
      linkedStudentId: "stu_1",
      country: "CO",
    },
    {
      currentSegment: "DROPPING",
      currentPriority: "P1" as const,
      currentStatus: "WATCHLIST" as const,
      country: "MX",
    },
    {
      currentSegment: "ZERO_SALES",
      currentPriority: "P2" as const,
      currentStatus: "INACTIVE" as const,
      country: "CO",
    },
  ];

  it("counts statuses, segments, priorities and countries", () => {
    const ov = buildOverview({
      members,
      currentRows: [],
    });
    expect(ov.totalMembers).toBe(3);
    expect(ov.activeMembers).toBe(1);
    expect(ov.inactiveMembers).toBe(1);
    expect(ov.watchlistMembers).toBe(1);
    expect(ov.linkedMembers).toBe(1);
    expect(ov.countriesCount).toBe(2);
    expect(ov.segmentCounts.TOP_PERFORMER).toBe(1);
    expect(ov.priorityCounts.P1).toBe(1);
    expect(ov.priorityCounts.P4).toBe(1);
  });

  it("derives deltas when previous period is provided", () => {
    const ov = buildOverview({
      members,
      currentRows: [
        { ordersEntered: 100, ordersMoved: 80, ordersDelivered: 60, ordersReturned: 10 },
      ],
      previousRows: [
        { ordersEntered: 80, ordersMoved: 60, ordersDelivered: 50, ordersReturned: 5 },
      ],
    });
    expect(ov.deltas?.ordersEntered.abs).toBe(20);
    expect(ov.deltas?.ordersEntered.pct).toBe(25);
    expect(ov.previous?.totals.ordersEntered).toBe(80);
  });

  it("returns null deltas when there is no previous period", () => {
    const ov = buildOverview({
      members,
      currentRows: [
        { ordersEntered: 10, ordersMoved: 8, ordersDelivered: 6, ordersReturned: 1 },
      ],
    });
    expect(ov.deltas).toBeNull();
    expect(ov.previous).toBeNull();
  });
});

describe("buildWeeklyTrend", () => {
  it("aggregates rows by period and computes deltas vs. previous bucket", () => {
    const rows = [
      {
        memberId: "m1",
        periodStart: new Date("2026-05-01"),
        periodEnd: new Date("2026-05-07"),
        ordersEntered: 10,
        ordersMoved: 8,
        ordersDelivered: 6,
        ordersReturned: 1,
      },
      {
        memberId: "m2",
        periodStart: new Date("2026-05-01"),
        periodEnd: new Date("2026-05-07"),
        ordersEntered: 5,
        ordersMoved: 4,
        ordersDelivered: 3,
        ordersReturned: 0,
      },
      {
        memberId: "m1",
        periodStart: new Date("2026-05-08"),
        periodEnd: new Date("2026-05-14"),
        ordersEntered: 30,
        ordersMoved: 24,
        ordersDelivered: 20,
        ordersReturned: 2,
      },
    ];
    const buckets = buildWeeklyTrend(rows);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].totals.ordersEntered).toBe(15);
    expect(buckets[0].memberCount).toBe(2);
    expect(buckets[0].deltaEnteredPct).toBeNull();
    expect(buckets[1].totals.ordersEntered).toBe(30);
    expect(buckets[1].deltaEnteredPct).toBe(100);
  });
});

describe("buildMonthlyTrend", () => {
  it("groups by year+month and computes month-over-month delta", () => {
    const rows = [
      {
        memberId: "m1",
        year: 2026,
        month: 4,
        ordersEntered: 20,
        ordersMoved: 18,
        ordersDelivered: 15,
        ordersReturned: 2,
      },
      {
        memberId: "m1",
        year: 2026,
        month: 5,
        ordersEntered: 30,
        ordersMoved: 24,
        ordersDelivered: 20,
        ordersReturned: 2,
      },
    ];
    const buckets = buildMonthlyTrend(rows);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].label).toBe("Abr 2026");
    expect(buckets[1].deltaEnteredPct).toBe(50);
  });
});

describe("buildByCountry and buildBySegment", () => {
  it("returns member counts and shares per country", () => {
    const buckets = buildByCountry({
      members: [
        { country: "CO" },
        { country: "CO" },
        { country: "MX" },
        { country: null },
      ],
      rows: [
        { country: "CO", ordersEntered: 10, ordersMoved: 8, ordersDelivered: 6, ordersReturned: 1 },
        { country: "MX", ordersEntered: 5, ordersMoved: 4, ordersDelivered: 3, ordersReturned: 0 },
      ],
    });
    expect(buckets[0].country).toBe("CO");
    expect(buckets[0].memberCount).toBe(2);
    expect(buckets[0].share).toBe(50);
    expect(buckets[0].totals.ordersEntered).toBe(10);
  });

  it("returns segment buckets sorted by member count", () => {
    const buckets = buildBySegment([
      { currentSegment: "TOP_PERFORMER" },
      { currentSegment: "TOP_PERFORMER" },
      { currentSegment: "DROPPING" },
      { currentSegment: null },
    ]);
    expect(buckets[0].segment).toBe("TOP_PERFORMER");
    expect(buckets[0].memberCount).toBe(2);
    const dropping = buckets.find((b) => b.segment === "DROPPING");
    expect(dropping?.label).toBe("En caída");
    const unsegmented = buckets.find((b) => b.segment === "UNSEGMENTED");
    expect(unsegmented?.label).toBe("Sin segmentar");
  });
});

describe("scoreOpportunity + rankOpportunities", () => {
  it("ranks high-return-risk and dropping members on top", () => {
    const members = [
      {
        id: "stable",
        fullName: "Estable",
        currentSegment: "STABLE",
        currentPriority: "P3" as const,
        currentStatus: "ACTIVE" as const,
        country: "CO",
        ordersEntered: 20,
        ordersMoved: 18,
        ordersDelivered: 15,
        ordersReturned: 1,
        movementRate: 90,
        deliveryRate: 83.33,
        returnRate: 5.56,
        deltaOrdersPercent: 0,
      },
      {
        id: "dropping",
        fullName: "Cayendo",
        currentSegment: "DROPPING",
        currentPriority: "P1" as const,
        currentStatus: "ACTIVE" as const,
        country: "MX",
        ordersEntered: 12,
        ordersMoved: 10,
        ordersDelivered: 5,
        ordersReturned: 1,
        movementRate: 83.33,
        deliveryRate: 50,
        returnRate: 10,
        deltaOrdersPercent: -45,
      },
      {
        id: "high-return",
        fullName: "Devoluciones",
        currentSegment: "HIGH_RETURN_RISK",
        currentPriority: "P2" as const,
        currentStatus: "ACTIVE" as const,
        country: "CO",
        ordersEntered: 30,
        ordersMoved: 25,
        ordersDelivered: 10,
        ordersReturned: 12,
        movementRate: 83.33,
        deliveryRate: 40,
        returnRate: 48,
        deltaOrdersPercent: 0,
      },
    ];
    const top = rankOpportunities(members, 3);
    expect(top[0].id).toBe("dropping");
    expect(top[0].reason).toContain("Caída fuerte");
    expect(top[1].id).toBe("high-return");
    expect(top[1].reason).toContain("Devoluciones altas");
    expect(top[2].id).toBe("stable");
  });

  it("scoreOpportunity adds the inactive penalty", () => {
    const base = {
      id: "x",
      ordersEntered: 5,
      ordersMoved: 5,
      ordersDelivered: 5,
      ordersReturned: 0,
      movementRate: 100,
      deliveryRate: 100,
      returnRate: 0,
      currentPriority: "P3" as const,
    };
    const active = scoreOpportunity({ ...base, currentStatus: "ACTIVE" });
    const inactive = scoreOpportunity({ ...base, currentStatus: "INACTIVE" });
    expect(inactive).toBeLessThan(active);
  });
});

describe("buildMemberDiagnostic", () => {
  it("returns insufficient-data summary when there are no weeks", () => {
    const d = buildMemberDiagnostic({
      member: { id: "m1", fullName: "Sin Datos" },
      weekly: [],
    });
    expect(d.trend).toBe("INSUFFICIENT_DATA");
    expect(d.summary).toContain("aún no tiene reportes");
    expect(d.warnings.length).toBeGreaterThan(0);
  });

  it("flags falling member with a Spanish summary and suggestion", () => {
    const d = buildMemberDiagnostic({
      member: {
        id: "m1",
        fullName: "María",
        country: "CO",
        currentSegment: "DROPPING",
        currentPriority: "P1",
        currentStatus: "ACTIVE",
      },
      weekly: [
        {
          periodStart: new Date("2026-05-01"),
          periodEnd: new Date("2026-05-07"),
          ordersEntered: 20,
          ordersMoved: 16,
          ordersDelivered: 12,
          ordersReturned: 1,
        },
        {
          periodStart: new Date("2026-05-08"),
          periodEnd: new Date("2026-05-14"),
          ordersEntered: 5,
          ordersMoved: 4,
          ordersDelivered: 3,
          ordersReturned: 0,
        },
      ],
    });
    expect(d.trend).toBe("DOWN");
    expect(d.delta.pct).toBe(-75);
    expect(d.summary).toContain("María");
    expect(d.summary).toContain("En caída");
    expect(
      d.suggestions.some((s) => s.toLowerCase().includes("seguimiento")),
    ).toBe(true);
    expect(
      d.warnings.some((w) => w.toLowerCase().includes("caída")),
    ).toBe(true);
  });

  it("highlights high return rate and suggests reviewing products", () => {
    const d = buildMemberDiagnostic({
      member: { id: "m1", fullName: "Juan", currentSegment: "HIGH_RETURN_RISK" },
      weekly: [
        {
          periodStart: new Date("2026-05-01"),
          periodEnd: new Date("2026-05-07"),
          ordersEntered: 50,
          ordersMoved: 40,
          ordersDelivered: 20,
          ordersReturned: 18,
        },
      ],
    });
    expect(d.rates.returnRate).toBeGreaterThanOrEqual(30);
    expect(
      d.warnings.some((w) => w.toLowerCase().includes("devoluciones")),
    ).toBe(true);
  });

  it("celebrates a top performer with growth", () => {
    const d = buildMemberDiagnostic({
      member: { id: "m1", fullName: "Top", currentSegment: "TOP_PERFORMER" },
      weekly: [
        {
          periodStart: new Date("2026-05-01"),
          periodEnd: new Date("2026-05-07"),
          ordersEntered: 80,
          ordersMoved: 70,
          ordersDelivered: 60,
          ordersReturned: 2,
        },
        {
          periodStart: new Date("2026-05-08"),
          periodEnd: new Date("2026-05-14"),
          ordersEntered: 120,
          ordersMoved: 110,
          ordersDelivered: 100,
          ordersReturned: 4,
        },
      ],
    });
    expect(d.trend).toBe("UP");
    expect(
      d.highlights.some((h) =>
        h.toLowerCase().includes("crecimiento") || h.toLowerCase().includes("mejor"),
      ),
    ).toBe(true);
  });
});
