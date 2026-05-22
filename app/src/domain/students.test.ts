import { describe, it, expect } from "vitest";
import { calculateEndDate, isPastEndDate } from "./students";

describe("calculateEndDate", () => {
  it("adds 12 months to a mid-month date", () => {
    const start = new Date(Date.UTC(2026, 0, 15));
    const end = calculateEndDate(start, 12);
    expect(end.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("adds 9 months", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = calculateEndDate(start, 9);
    expect(end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("clamps Jan 31 + 1 month to Feb 28 (non-leap)", () => {
    const start = new Date(Date.UTC(2026, 0, 31));
    const end = calculateEndDate(start, 1);
    expect(end.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("clamps Jan 31 + 1 month to Feb 29 in leap year", () => {
    const start = new Date(Date.UTC(2024, 0, 31));
    const end = calculateEndDate(start, 1);
    expect(end.toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("crosses year boundary", () => {
    const start = new Date(Date.UTC(2026, 9, 15));
    const end = calculateEndDate(start, 6);
    expect(end.toISOString()).toBe("2027-04-15T00:00:00.000Z");
  });

  it("throws on zero duration", () => {
    expect(() => calculateEndDate(new Date(), 0)).toThrow();
  });

  it("throws on negative duration", () => {
    expect(() => calculateEndDate(new Date(), -3)).toThrow();
  });

  it("throws on non-integer duration", () => {
    expect(() => calculateEndDate(new Date(), 1.5)).toThrow();
  });
});

describe("isPastEndDate", () => {
  it("returns true when today equals endDate", () => {
    const end = new Date(Date.UTC(2026, 0, 15));
    const today = new Date(Date.UTC(2026, 0, 15));
    expect(isPastEndDate(end, today)).toBe(true);
  });

  it("returns true when today is after endDate", () => {
    const end = new Date(Date.UTC(2026, 0, 15));
    const today = new Date(Date.UTC(2026, 0, 16));
    expect(isPastEndDate(end, today)).toBe(true);
  });

  it("returns false when today is before endDate", () => {
    const end = new Date(Date.UTC(2026, 0, 15));
    const today = new Date(Date.UTC(2026, 0, 14));
    expect(isPastEndDate(end, today)).toBe(false);
  });

  it("ignores time-of-day", () => {
    const end = new Date(Date.UTC(2026, 0, 15, 0, 0, 0));
    const todayLate = new Date(Date.UTC(2026, 0, 14, 23, 59, 59));
    expect(isPastEndDate(end, todayLate)).toBe(false);
  });
});
