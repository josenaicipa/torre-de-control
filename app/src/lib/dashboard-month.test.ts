import { describe, it, expect } from "vitest";
import {
  parseIsoDate,
  resolveMonthState,
  resolveProjection,
  resolveRhythm,
} from "./dashboard-month";

const TODAY = parseIsoDate("2026-05-27"); // matches the reported live scenario

describe("resolveMonthState", () => {
  it("treats a month strictly before today as past", () => {
    expect(resolveMonthState(2026, 3 /* April */, TODAY)).toBe("past");
  });

  it("treats any month in a prior year as past", () => {
    expect(resolveMonthState(2025, 11, TODAY)).toBe("past");
  });

  it("treats the same year+month as current", () => {
    expect(resolveMonthState(2026, 4 /* May */, TODAY)).toBe("current");
  });

  it("treats a later month in the same year as future", () => {
    expect(resolveMonthState(2026, 5 /* June */, TODAY)).toBe("future");
  });

  it("treats any month in a future year as future", () => {
    expect(resolveMonthState(2027, 0, TODAY)).toBe("future");
  });
});

describe("resolveRhythm", () => {
  it("returns full month for a closed past month, regardless of cfgDay", () => {
    const r = resolveRhythm({
      state: "past",
      daysInMonth: 30,
      cfgDay: 27, // mimics the bug: today's day leaking into the past month
      todayDay: 27,
    });
    expect(r.day).toBe(30);
    expect(r.pctElapsed).toBe(1);
  });

  it("returns zero progress for future months", () => {
    const r = resolveRhythm({
      state: "future",
      daysInMonth: 30,
      cfgDay: 15,
      todayDay: 27,
    });
    expect(r.day).toBe(0);
    expect(r.pctElapsed).toBe(0);
  });

  it("uses cfgDay capped to the month length for the current month", () => {
    const r = resolveRhythm({
      state: "current",
      daysInMonth: 31,
      cfgDay: 27,
      todayDay: 27,
    });
    expect(r.day).toBe(27);
    expect(r.pctElapsed).toBeCloseTo(27 / 31);
  });

  it("falls back to todayDay when cfgDay is missing", () => {
    const r = resolveRhythm({
      state: "current",
      daysInMonth: 31,
      cfgDay: null,
      todayDay: 14,
    });
    expect(r.day).toBe(14);
  });

  it("never lets day exceed daysInMonth", () => {
    const r = resolveRhythm({
      state: "current",
      daysInMonth: 28,
      cfgDay: 99,
      todayDay: 27,
    });
    expect(r.day).toBe(28);
    expect(r.pctElapsed).toBe(1);
  });
});

describe("resolveProjection", () => {
  it("projects only for the current month", () => {
    expect(
      resolveProjection({
        state: "current",
        day: 27,
        daysInMonth: 31,
        cashCollected: 90000,
      }),
    ).toBeCloseTo((90000 / 27) * 31);
  });

  it("returns null for past months (no projection, month is closed)", () => {
    expect(
      resolveProjection({
        state: "past",
        day: 30,
        daysInMonth: 30,
        cashCollected: 120000,
      }),
    ).toBeNull();
  });

  it("returns null for future months (must not invent progress)", () => {
    expect(
      resolveProjection({
        state: "future",
        day: 0,
        daysInMonth: 30,
        cashCollected: 0,
      }),
    ).toBeNull();
  });

  it("returns null with no cash even on the current month", () => {
    expect(
      resolveProjection({
        state: "current",
        day: 5,
        daysInMonth: 31,
        cashCollected: 0,
      }),
    ).toBeNull();
  });
});

describe("scenario: April 2026 selected while today is 2026-05-27", () => {
  it("does not display 27/30 days or a fake projection", () => {
    const state = resolveMonthState(2026, 3, TODAY);
    expect(state).toBe("past");
    const rhythm = resolveRhythm({
      state,
      daysInMonth: 30,
      cfgDay: 27, // simulates kpi.day fallback to today's date
      todayDay: 27,
    });
    expect(rhythm.day).toBe(30);
    expect(rhythm.pctElapsed).toBe(1);
    const projection = resolveProjection({
      state,
      day: rhythm.day,
      daysInMonth: 30,
      cashCollected: 50000,
    });
    expect(projection).toBeNull();
  });
});
