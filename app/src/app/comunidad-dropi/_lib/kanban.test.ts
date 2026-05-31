import { describe, expect, it } from "vitest";
import {
  KANBAN_COLUMNS,
  KANBAN_STATUS_ORDER,
  buildKanbanHref,
  groupByKanbanStatus,
  parseKanbanFilters,
} from "./kanban";

describe("KANBAN_COLUMNS", () => {
  it("declares the four operative statuses in left-to-right reading order", () => {
    expect(KANBAN_COLUMNS.map((c) => c.status)).toEqual([
      "OPEN",
      "IN_PROGRESS",
      "DONE",
      "DISMISSED",
    ]);
  });

  it("uses Spanish labels for managers", () => {
    const labels = Object.fromEntries(
      KANBAN_COLUMNS.map((c) => [c.status, c.label]),
    );
    expect(labels.OPEN).toBe("Abierto");
    expect(labels.IN_PROGRESS).toBe("En curso");
    expect(labels.DONE).toBe("Hecho");
    expect(labels.DISMISSED).toBe("Descartado");
  });

  it("KANBAN_STATUS_ORDER mirrors KANBAN_COLUMNS so callers can iterate either", () => {
    expect(KANBAN_STATUS_ORDER).toEqual(KANBAN_COLUMNS.map((c) => c.status));
  });
});

describe("groupByKanbanStatus", () => {
  it("places each row in the bucket matching its status", () => {
    const rows = [
      { id: "a", status: "OPEN" },
      { id: "b", status: "IN_PROGRESS" },
      { id: "c", status: "DONE" },
      { id: "d", status: "DISMISSED" },
      { id: "e", status: "OPEN" },
    ];
    const grouped = groupByKanbanStatus(rows);
    expect(grouped.OPEN.map((r) => r.id)).toEqual(["a", "e"]);
    expect(grouped.IN_PROGRESS.map((r) => r.id)).toEqual(["b"]);
    expect(grouped.DONE.map((r) => r.id)).toEqual(["c"]);
    expect(grouped.DISMISSED.map((r) => r.id)).toEqual(["d"]);
  });

  it("returns empty arrays for every column when input is empty", () => {
    const grouped = groupByKanbanStatus([]);
    for (const status of KANBAN_STATUS_ORDER) {
      expect(grouped[status]).toEqual([]);
    }
  });

  it("ignores rows with unknown status instead of throwing", () => {
    const grouped = groupByKanbanStatus([
      { id: "a", status: "OPEN" },
      { id: "b", status: "WAT" },
    ]);
    expect(grouped.OPEN.map((r) => r.id)).toEqual(["a"]);
    expect(
      Object.values(grouped).every((rows) => !rows.some((r) => r.id === "b")),
    ).toBe(true);
  });

  it("preserves incoming row order within a column", () => {
    const grouped = groupByKanbanStatus([
      { id: "first", status: "OPEN" },
      { id: "second", status: "OPEN" },
      { id: "third", status: "OPEN" },
    ]);
    expect(grouped.OPEN.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });
});

describe("parseKanbanFilters", () => {
  it("returns sensible defaults when no params are present", () => {
    const f = parseKanbanFilters({});
    expect(f.priority).toBeUndefined();
    expect(f.reason).toBeUndefined();
    expect(f.country).toBeUndefined();
    expect(f.q).toBeUndefined();
    expect(f.assignedToId).toBeUndefined();
    expect(f.mine).toBe(false);
    expect(f.unassigned).toBe(false);
  });

  it("only accepts known priority codes", () => {
    expect(parseKanbanFilters({ priority: "P9" }).priority).toBeUndefined();
    expect(parseKanbanFilters({ priority: "P1" }).priority).toBe("P1");
  });

  it("trims free-form filters and discards empty strings", () => {
    const f = parseKanbanFilters({
      reason: " ZERO_SALES ",
      q: "   ",
      country: " CO ",
    });
    expect(f.reason).toBe("ZERO_SALES");
    expect(f.q).toBeUndefined();
    expect(f.country).toBe("CO");
  });

  it("coerces mine/unassigned booleans from the string '1'", () => {
    const f = parseKanbanFilters({ mine: "1", unassigned: "1" });
    expect(f.mine).toBe(true);
    expect(f.unassigned).toBe(true);
  });

  it("ignores status and bucket params because the kanban shows every status column", () => {
    const f = parseKanbanFilters({ status: "DONE", bucket: "OVERDUE" });
    // The kanban view is intentionally status-agnostic so no `status` field is
    // exposed on the filter object; the same holds for buckets which are a
    // table-only concept.
    expect((f as unknown as Record<string, unknown>).status).toBeUndefined();
    expect((f as unknown as Record<string, unknown>).bucket).toBeUndefined();
  });
});

describe("buildKanbanHref", () => {
  it("returns just '?' when no filters are active", () => {
    expect(buildKanbanHref({})).toBe("?");
  });

  it("emits priority, country, reason and free-text q", () => {
    const href = buildKanbanHref({
      priority: "P1",
      reason: "ZERO_SALES",
      country: "CO",
      q: "maria",
    });
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("priority")).toBe("P1");
    expect(params.get("reason")).toBe("ZERO_SALES");
    expect(params.get("country")).toBe("CO");
    expect(params.get("q")).toBe("maria");
  });

  it("encodes mine/unassigned only when true", () => {
    const params = new URLSearchParams(
      buildKanbanHref({ mine: true, unassigned: false }).slice(1),
    );
    expect(params.get("mine")).toBe("1");
    expect(params.get("unassigned")).toBeNull();
  });

  it("never emits status or bucket params even if a caller smuggled them in", () => {
    const ambient = {
      priority: "P2",
      assignedToId: "u_1",
    } satisfies Partial<Parameters<typeof buildKanbanHref>[0]>;
    const href = buildKanbanHref(ambient, {
      status: "DONE",
      bucket: "OVERDUE",
    });
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("status")).toBeNull();
    expect(params.get("bucket")).toBeNull();
    // Caller-set fields are still preserved.
    expect(params.get("priority")).toBe("P2");
    expect(params.get("assignedToId")).toBe("u_1");
  });

  it("lets overrides drop a key by passing null", () => {
    const href = buildKanbanHref(
      { priority: "P1", country: "CO" },
      { priority: null },
    );
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("priority")).toBeNull();
    expect(params.get("country")).toBe("CO");
  });
});
