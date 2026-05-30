import { describe, expect, it } from "vitest";
import {
  BUCKET_ORDER,
  addDays,
  buildFollowUpsHref,
  diffInCalendarDays,
  formatLongDateEs,
  formatRelativeDateEs,
  getDueBucket,
  groupByBucket,
  kpiHref,
  parseFollowUpsFilters,
  startOfUtcDay,
  type FollowUpsFilters,
} from "./follow-ups";

const NOW = new Date("2026-05-30T15:00:00.000Z");

describe("startOfUtcDay", () => {
  it("zeroes hours/minutes/seconds in UTC", () => {
    const d = startOfUtcDay(NOW);
    expect(d.toISOString()).toBe("2026-05-30T00:00:00.000Z");
  });

  it("is stable across DST-like local shifts because we use UTC accessors", () => {
    const same = startOfUtcDay(new Date("2026-05-30T23:59:59.999Z"));
    expect(same.toISOString()).toBe("2026-05-30T00:00:00.000Z");
  });
});

describe("addDays", () => {
  it("moves forward by N calendar days", () => {
    expect(addDays(startOfUtcDay(NOW), 3).toISOString()).toBe(
      "2026-06-02T00:00:00.000Z",
    );
  });

  it("moves backwards with a negative N", () => {
    expect(addDays(startOfUtcDay(NOW), -1).toISOString()).toBe(
      "2026-05-29T00:00:00.000Z",
    );
  });

  it("does not mutate the input", () => {
    const start = startOfUtcDay(NOW);
    const before = start.toISOString();
    addDays(start, 5);
    expect(start.toISOString()).toBe(before);
  });
});

describe("diffInCalendarDays", () => {
  it("returns 0 for two timestamps on the same UTC day", () => {
    const a = new Date("2026-05-30T03:00:00.000Z");
    const b = new Date("2026-05-30T23:00:00.000Z");
    expect(diffInCalendarDays(a, b)).toBe(0);
  });

  it("returns positive deltas for future dates", () => {
    const future = new Date("2026-06-02T08:00:00.000Z");
    expect(diffInCalendarDays(future, NOW)).toBe(3);
  });

  it("returns negative deltas for past dates", () => {
    const past = new Date("2026-05-28T20:00:00.000Z");
    expect(diffInCalendarDays(past, NOW)).toBe(-2);
  });
});

describe("getDueBucket", () => {
  it("classifies a missing date as NO_DATE", () => {
    expect(getDueBucket(null, NOW)).toBe("NO_DATE");
  });

  it("treats invalid strings as NO_DATE so the table never crashes on bad data", () => {
    expect(getDueBucket("not-a-date", NOW)).toBe("NO_DATE");
  });

  it("classifies yesterday as OVERDUE", () => {
    expect(getDueBucket("2026-05-29T10:00:00.000Z", NOW)).toBe("OVERDUE");
  });

  it("classifies today as TODAY regardless of intra-day time", () => {
    expect(getDueBucket("2026-05-30T01:00:00.000Z", NOW)).toBe("TODAY");
    expect(getDueBucket("2026-05-30T23:30:00.000Z", NOW)).toBe("TODAY");
  });

  it("classifies days +1..+7 as THIS_WEEK", () => {
    expect(getDueBucket("2026-05-31T00:00:00.000Z", NOW)).toBe("THIS_WEEK");
    expect(getDueBucket("2026-06-06T00:00:00.000Z", NOW)).toBe("THIS_WEEK");
  });

  it("classifies day +8 and beyond as UPCOMING", () => {
    expect(getDueBucket("2026-06-07T00:00:00.000Z", NOW)).toBe("UPCOMING");
    expect(getDueBucket("2026-12-01T00:00:00.000Z", NOW)).toBe("UPCOMING");
  });
});

describe("formatRelativeDateEs", () => {
  it("returns 'Sin fecha' for null", () => {
    expect(formatRelativeDateEs(null, NOW)).toBe("Sin fecha");
  });

  it("returns 'Sin fecha' for invalid strings", () => {
    expect(formatRelativeDateEs("nope", NOW)).toBe("Sin fecha");
  });

  it("uses 'hoy' / 'mañana' / 'ayer' for the adjacent calendar days", () => {
    expect(formatRelativeDateEs("2026-05-30T09:00:00.000Z", NOW)).toBe("hoy");
    expect(formatRelativeDateEs("2026-05-31T09:00:00.000Z", NOW)).toBe("mañana");
    expect(formatRelativeDateEs("2026-05-29T09:00:00.000Z", NOW)).toBe("ayer");
  });

  it("uses 'en N días' for further future dates", () => {
    expect(formatRelativeDateEs("2026-06-04T09:00:00.000Z", NOW)).toBe(
      "en 5 días",
    );
  });

  it("uses 'hace N días' for further past dates", () => {
    expect(formatRelativeDateEs("2026-05-26T09:00:00.000Z", NOW)).toBe(
      "hace 4 días",
    );
  });
});

describe("formatLongDateEs", () => {
  it("falls back to 'Sin fecha' for null", () => {
    expect(formatLongDateEs(null)).toBe("Sin fecha");
  });

  it("falls back to 'Sin fecha' for invalid strings", () => {
    expect(formatLongDateEs("garbage")).toBe("Sin fecha");
  });

  it("returns a non-empty Spanish string for a valid date", () => {
    const out = formatLongDateEs("2026-05-30T09:00:00.000Z");
    expect(out).not.toBe("Sin fecha");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("parseFollowUpsFilters", () => {
  it("returns the OPEN_AND_PROGRESS default when status is missing or unknown", () => {
    expect(parseFollowUpsFilters({}).status).toBe("OPEN_AND_PROGRESS");
    expect(parseFollowUpsFilters({ status: "GIBBERISH" }).status).toBe(
      "OPEN_AND_PROGRESS",
    );
  });

  it("accepts each concrete status value", () => {
    expect(parseFollowUpsFilters({ status: "DONE" }).status).toBe("DONE");
    expect(parseFollowUpsFilters({ status: "DISMISSED" }).status).toBe(
      "DISMISSED",
    );
  });

  it("only accepts known priorities and buckets", () => {
    expect(parseFollowUpsFilters({ priority: "P9" }).priority).toBeUndefined();
    expect(parseFollowUpsFilters({ priority: "P1" }).priority).toBe("P1");
    expect(parseFollowUpsFilters({ bucket: "WEEKEND" }).bucket).toBeUndefined();
    expect(parseFollowUpsFilters({ bucket: "TODAY" }).bucket).toBe("TODAY");
  });

  it("trims free-form filters and discards empty strings", () => {
    const f = parseFollowUpsFilters({
      reason: "  ZERO_SALES  ",
      q: "   ",
      country: " CO ",
    });
    expect(f.reason).toBe("ZERO_SALES");
    expect(f.q).toBeUndefined();
    expect(f.country).toBe("CO");
  });

  it("coerces mine/unassigned flags from the string '1'", () => {
    const f = parseFollowUpsFilters({ mine: "1", unassigned: "1" });
    expect(f.mine).toBe(true);
    expect(f.unassigned).toBe(true);
  });

  it("clamps page to at least 1 and tolerates garbage", () => {
    expect(parseFollowUpsFilters({ page: "0" }).page).toBe(1);
    expect(parseFollowUpsFilters({ page: "-3" }).page).toBe(1);
    expect(parseFollowUpsFilters({ page: "abc" }).page).toBe(1);
    expect(parseFollowUpsFilters({ page: "4" }).page).toBe(4);
  });
});

describe("buildFollowUpsHref", () => {
  it("omits the default status and page=1 so the canonical URL stays clean", () => {
    const href = buildFollowUpsHref({
      status: "OPEN_AND_PROGRESS",
      page: 1,
    });
    expect(href).toBe("?");
  });

  it("emits non-default status, priority, and page", () => {
    const href = buildFollowUpsHref({
      status: "DONE",
      priority: "P2",
      page: 3,
    });
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("status")).toBe("DONE");
    expect(params.get("priority")).toBe("P2");
    expect(params.get("page")).toBe("3");
  });

  it("encodes mine/unassigned as '1'", () => {
    const href = buildFollowUpsHref({ mine: true, unassigned: false });
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("mine")).toBe("1");
    expect(params.get("unassigned")).toBeNull();
  });

  it("lets overrides drop a key by passing null", () => {
    const href = buildFollowUpsHref(
      { priority: "P1", bucket: "TODAY" },
      { priority: null },
    );
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("priority")).toBeNull();
    expect(params.get("bucket")).toBe("TODAY");
  });
});

describe("kpiHref", () => {
  it("ignores any ambient filters because KPI clicks are a reset", () => {
    const ambient: Partial<FollowUpsFilters> = {
      priority: "P3",
      mine: true,
      country: "CO",
    };
    void ambient;
    const href = kpiHref({ bucket: "OVERDUE" });
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("bucket")).toBe("OVERDUE");
    expect(params.get("priority")).toBeNull();
    expect(params.get("mine")).toBeNull();
    expect(params.get("country")).toBeNull();
  });

  it("returns just '?' when given no preset", () => {
    expect(kpiHref({})).toBe("?");
  });
});

describe("groupByBucket", () => {
  it("places each row in the bucket determined by its dueDate", () => {
    const rows = [
      { id: "a", dueDate: "2026-05-29T00:00:00.000Z" }, // OVERDUE
      { id: "b", dueDate: "2026-05-30T00:00:00.000Z" }, // TODAY
      { id: "c", dueDate: "2026-06-02T00:00:00.000Z" }, // THIS_WEEK
      { id: "d", dueDate: "2026-06-20T00:00:00.000Z" }, // UPCOMING
      { id: "e", dueDate: null }, // NO_DATE
    ];
    const grouped = groupByBucket(rows, NOW);
    expect(grouped.OVERDUE.map((r) => r.id)).toEqual(["a"]);
    expect(grouped.TODAY.map((r) => r.id)).toEqual(["b"]);
    expect(grouped.THIS_WEEK.map((r) => r.id)).toEqual(["c"]);
    expect(grouped.UPCOMING.map((r) => r.id)).toEqual(["d"]);
    expect(grouped.NO_DATE.map((r) => r.id)).toEqual(["e"]);
  });

  it("preserves the incoming row order within each bucket", () => {
    const rows = [
      { id: "first", dueDate: "2026-05-29T00:00:00.000Z" },
      { id: "second", dueDate: "2026-05-28T00:00:00.000Z" },
      { id: "third", dueDate: "2026-05-29T12:00:00.000Z" },
    ];
    expect(groupByBucket(rows, NOW).OVERDUE.map((r) => r.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("returns every bucket key even when empty so callers can iterate BUCKET_ORDER", () => {
    const grouped = groupByBucket([], NOW);
    for (const bucket of BUCKET_ORDER) {
      expect(Array.isArray(grouped[bucket])).toBe(true);
      expect(grouped[bucket].length).toBe(0);
    }
  });
});
