import { describe, it, expect } from "vitest";
import {
  daysSinceLastUpdate,
  needsProgressAlert,
  PROGRESS_WINDOW_DAYS,
} from "./progress";

describe("daysSinceLastUpdate", () => {
  it("returns days since last update", () => {
    const today = new Date(Date.UTC(2026, 0, 20));
    const last = new Date(Date.UTC(2026, 0, 5));
    expect(daysSinceLastUpdate(last, today)).toBe(15);
  });

  it("returns 0 when same day", () => {
    const today = new Date(Date.UTC(2026, 0, 20, 23, 0, 0));
    const last = new Date(Date.UTC(2026, 0, 20, 0, 0, 0));
    expect(daysSinceLastUpdate(last, today)).toBe(0);
  });

  it("returns Infinity when null", () => {
    expect(daysSinceLastUpdate(null, new Date())).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns Infinity when undefined", () => {
    expect(daysSinceLastUpdate(undefined, new Date())).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});

describe("needsProgressAlert", () => {
  it("false when within 15 days", () => {
    const today = new Date(Date.UTC(2026, 0, 20));
    const last = new Date(Date.UTC(2026, 0, 10));
    expect(needsProgressAlert(last, today)).toBe(false);
  });

  it("true when >15 days passed", () => {
    const today = new Date(Date.UTC(2026, 0, 25));
    const last = new Date(Date.UTC(2026, 0, 1));
    expect(needsProgressAlert(last, today)).toBe(true);
  });

  it("false at exactly 15 days (boundary inclusive)", () => {
    const today = new Date(Date.UTC(2026, 0, 16));
    const last = new Date(Date.UTC(2026, 0, 1));
    expect(needsProgressAlert(last, today)).toBe(false);
  });

  it("true when no updates", () => {
    expect(needsProgressAlert(null, new Date())).toBe(true);
  });

  it("default window is 15 days", () => {
    expect(PROGRESS_WINDOW_DAYS).toBe(15);
  });

  it("accepts custom window", () => {
    const today = new Date(Date.UTC(2026, 0, 20));
    const last = new Date(Date.UTC(2026, 0, 15));
    expect(needsProgressAlert(last, today, 3)).toBe(true);
    expect(needsProgressAlert(last, today, 10)).toBe(false);
  });
});
