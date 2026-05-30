import { describe, expect, it } from "vitest";
import {
  calculateSegment,
  followUpReasonForSegment,
} from "./comunidad-dropi-segments";

describe("calculateSegment", () => {
  it("marks zero sales when no orders entered", () => {
    const r = calculateSegment({ ordersEntered: 0 });
    expect(r.segment).toBe("ZERO_SALES");
    expect(r.trend).toBe("ZERO");
  });

  it("marks high return risk over threshold", () => {
    const r = calculateSegment({
      ordersEntered: 10,
      returnRate: 35,
      previousOrdersEntered: 9,
    });
    expect(r.segment).toBe("HIGH_RETURN_RISK");
    expect(r.priority).toBe("P2");
  });

  it("escalates HIGH_RETURN_RISK to P1 above 50%", () => {
    const r = calculateSegment({
      ordersEntered: 12,
      returnRate: 70,
    });
    expect(r.segment).toBe("HIGH_RETURN_RISK");
    expect(r.priority).toBe("P1");
  });

  it("marks new seller when first period and orders > 0", () => {
    const r = calculateSegment({
      ordersEntered: 4,
      isFirstPeriodSeen: true,
    });
    expect(r.segment).toBe("NEW_SELLER");
    expect(r.trend).toBe("NEW");
    expect(r.priority).toBe("P2");
  });

  it("marks recovered when bouncing back from zero", () => {
    const r = calculateSegment({
      ordersEntered: 5,
      previousOrdersEntered: 0,
    });
    expect(r.segment).toBe("RECOVERED");
  });

  it("marks top performer with high volume", () => {
    const r = calculateSegment({
      ordersEntered: 80,
      previousOrdersEntered: 75,
    });
    expect(r.segment).toBe("TOP_PERFORMER");
    expect(r.priority).toBe("P4");
  });

  it("marks dropping when delta is steeply negative", () => {
    const r = calculateSegment({
      ordersEntered: 6,
      previousOrdersEntered: 12,
    });
    expect(r.segment).toBe("DROPPING");
    expect(r.priority).toBe("P1");
    expect(r.deltaOrders).toBe(-6);
    expect(r.deltaPercent).toBeCloseTo(-50, 1);
  });

  it("marks growing when delta is steeply positive", () => {
    const r = calculateSegment({
      ordersEntered: 20,
      previousOrdersEntered: 10,
    });
    expect(r.segment).toBe("GROWING");
    expect(r.priority).toBe("P3");
  });

  it("marks low volume when small but stable", () => {
    const r = calculateSegment({
      ordersEntered: 3,
      previousOrdersEntered: 3,
    });
    expect(r.segment).toBe("LOW_VOLUME");
  });

  it("marks stable when above low-volume and no drama", () => {
    const r = calculateSegment({
      ordersEntered: 15,
      previousOrdersEntered: 15,
    });
    expect(r.segment).toBe("STABLE");
    expect(r.priority).toBe("P3");
  });

  it("returns null deltas when no previous period", () => {
    const r = calculateSegment({ ordersEntered: 12 });
    expect(r.deltaOrders).toBeNull();
    expect(r.deltaPercent).toBeNull();
  });
});

describe("followUpReasonForSegment", () => {
  it("maps actionable segments to follow-up reasons", () => {
    expect(followUpReasonForSegment("ZERO_SALES")).toBe("ZERO_SALES");
    expect(followUpReasonForSegment("DROPPING")).toBe("DROP");
    expect(followUpReasonForSegment("HIGH_RETURN_RISK")).toBe("HIGH_RETURN");
    expect(followUpReasonForSegment("LOW_VOLUME")).toBe("LOW_VOLUME");
    expect(followUpReasonForSegment("TOP_PERFORMER")).toBe("TOP_PERFORMER");
  });
  it("does not open follow-ups for neutral segments", () => {
    expect(followUpReasonForSegment("STABLE")).toBeNull();
    expect(followUpReasonForSegment("GROWING")).toBeNull();
    expect(followUpReasonForSegment("NEW_SELLER")).toBeNull();
    expect(followUpReasonForSegment("RECOVERED")).toBeNull();
  });
});
