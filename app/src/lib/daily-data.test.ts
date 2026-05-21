import { describe, expect, it } from "vitest";
import { buildDailyResponse, type DailyMetricRow } from "./daily-data";

const sampleRow: DailyMetricRow = {
  date: "2026-05-20",
  channel: "meta",
  spend: 100,
  booked: 5,
  showed: 3,
  closed: 1,
  revenue: 2000,
};

describe("buildDailyResponse", () => {
  it("returns an explicit no-data state when there are no rows", () => {
    const result = buildDailyResponse([]);
    expect(result.mode).toBe("no-data");
    expect(result.rowCount).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.reason).toBe("empty");
  });

  it("returns data mode with rows when present", () => {
    const result = buildDailyResponse([sampleRow]);
    expect(result.mode).toBe("data");
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].channel).toBe("meta");
    expect(result.reason).toBeUndefined();
  });

  it("marks freshness fresh when last sync is recent", () => {
    const now = Date.parse("2026-05-21T12:00:00Z");
    const result = buildDailyResponse(
      [sampleRow],
      "2026-05-21T06:00:00Z",
      now,
    );
    expect(result.freshness).toBe("fresh");
  });

  it("marks freshness stale when last sync is old", () => {
    const now = Date.parse("2026-05-21T12:00:00Z");
    const result = buildDailyResponse(
      [sampleRow],
      "2026-05-01T06:00:00Z",
      now,
    );
    expect(result.freshness).toBe("stale");
  });

  it("leaves freshness unknown when no sync timestamp is provided", () => {
    const result = buildDailyResponse([sampleRow]);
    expect(result.freshness).toBe("unknown");
  });
});
