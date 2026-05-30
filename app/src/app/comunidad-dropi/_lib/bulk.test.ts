import { describe, expect, it } from "vitest";
import {
  bulkPatchSchema,
  diffSelectionForGroup,
  isEverySelected,
  isSomeSelected,
  mergeSelection,
  removeFromSelection,
  summarizeBulkOutcome,
  toggleSelection,
  type BulkOutcome,
} from "./bulk";

describe("bulkPatchSchema", () => {
  it("requires at least one id", () => {
    const result = bulkPatchSchema.safeParse({
      ids: [],
      patch: { status: "DONE" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 100 ids so the endpoint can stay snappy", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    const result = bulkPatchSchema.safeParse({
      ids,
      patch: { status: "DONE" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicated ids so the audit batch stays accurate", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a", "b", "a"],
      patch: { status: "DONE" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty or whitespace-only ids", () => {
    expect(
      bulkPatchSchema.safeParse({ ids: [""], patch: { status: "DONE" } })
        .success,
    ).toBe(false);
    expect(
      bulkPatchSchema.safeParse({ ids: ["   "], patch: { status: "DONE" } })
        .success,
    ).toBe(false);
  });

  it("rejects an empty patch — bulk endpoints must always change something", () => {
    const result = bulkPatchSchema.safeParse({ ids: ["a"], patch: {} });
    expect(result.success).toBe(false);
  });

  it("rejects unknown patch keys so callers cannot smuggle fields", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      // notes is allowed for the per-id PATCH but not part of the bulk surface;
      // the bar only exposes assign/priority/status, so the schema mirrors that.
      patch: { notes: "no se permite" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts a status-only patch", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a", "b"],
      patch: { status: "DONE" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a priority-only patch", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { priority: "P1" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts assignedToId: null to clear the responsable", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { assignedToId: null },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a combined patch with several keys", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { status: "DONE", priority: "P1", assignedToId: "user-1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown status / priority values", () => {
    expect(
      bulkPatchSchema.safeParse({ ids: ["a"], patch: { status: "ARCHIVED" } })
        .success,
    ).toBe(false);
    expect(
      bulkPatchSchema.safeParse({ ids: ["a"], patch: { priority: "P9" } })
        .success,
    ).toBe(false);
  });

  // Phase B step 1: the bulk surface is widened — but only with fields that
  // make sense to apply uniformly to a batch (posponer hasta una fecha,
  // marcar canal usado, registrar outcome del round de contacto). Free-form
  // notes / result / per-case dates still stay in the drawer.
  it("accepts snoozedUntil as ISO date string for bulk posponer", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { snoozedUntil: "2026-06-10" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts snoozedUntil: null to lift the snooze on a batch", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { snoozedUntil: null },
    });
    expect(result.success).toBe(true);
  });

  it("rejects snoozedUntil garbage strings even in bulk", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { snoozedUntil: "next week" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts contactChannel and outcome for bulk", () => {
    const result = bulkPatchSchema.safeParse({
      ids: ["a"],
      patch: { contactChannel: "WHATSAPP", outcome: "NO_ANSWER" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown outcome / contactChannel values in bulk", () => {
    expect(
      bulkPatchSchema.safeParse({
        ids: ["a"],
        patch: { outcome: "GHOSTED" },
      }).success,
    ).toBe(false);
    expect(
      bulkPatchSchema.safeParse({
        ids: ["a"],
        patch: { contactChannel: "SMS" },
      }).success,
    ).toBe(false);
  });

  it("still rejects free-form notes / result / dueDate / contactedAt in bulk", () => {
    for (const patch of [
      { notes: "no" },
      { result: "no" },
      { dueDate: "2026-06-01" },
      { contactedAt: "2026-05-30" },
      { nextActionAt: "2026-06-05" },
    ]) {
      const result = bulkPatchSchema.safeParse({ ids: ["a"], patch });
      expect(result.success).toBe(false);
    }
  });
});

describe("toggleSelection", () => {
  it("adds an id that was not selected", () => {
    const next = toggleSelection(new Set(["a"]), "b");
    expect([...next].sort()).toEqual(["a", "b"]);
  });

  it("removes an id that was already selected", () => {
    const next = toggleSelection(new Set(["a", "b"]), "a");
    expect([...next]).toEqual(["b"]);
  });

  it("does not mutate the source set", () => {
    const source = new Set(["a"]);
    toggleSelection(source, "b");
    expect([...source]).toEqual(["a"]);
  });
});

describe("mergeSelection", () => {
  it("adds every id from the group", () => {
    const next = mergeSelection(new Set(["a"]), ["b", "c"]);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("is idempotent when all ids are already present", () => {
    const source = new Set(["a", "b"]);
    const next = mergeSelection(source, ["a", "b"]);
    expect([...next].sort()).toEqual(["a", "b"]);
  });
});

describe("removeFromSelection", () => {
  it("removes every id in the group", () => {
    const next = removeFromSelection(new Set(["a", "b", "c"]), ["b", "c"]);
    expect([...next]).toEqual(["a"]);
  });

  it("ignores ids that are not present", () => {
    const next = removeFromSelection(new Set(["a"]), ["b"]);
    expect([...next]).toEqual(["a"]);
  });
});

describe("isEverySelected", () => {
  it("returns true when every id of the group is in the selection", () => {
    expect(isEverySelected(new Set(["a", "b"]), ["a", "b"])).toBe(true);
  });

  it("returns false when at least one id is missing", () => {
    expect(isEverySelected(new Set(["a"]), ["a", "b"])).toBe(false);
  });

  it("returns false on an empty group so the master checkbox does not flip on", () => {
    expect(isEverySelected(new Set(["a"]), [])).toBe(false);
  });
});

describe("isSomeSelected", () => {
  it("returns true when any id is selected", () => {
    expect(isSomeSelected(new Set(["b"]), ["a", "b"])).toBe(true);
  });

  it("returns false when none of the ids match", () => {
    expect(isSomeSelected(new Set(["x"]), ["a", "b"])).toBe(false);
  });

  it("returns false on an empty group", () => {
    expect(isSomeSelected(new Set(["a"]), [])).toBe(false);
  });
});

describe("diffSelectionForGroup", () => {
  // The master checkbox flips on/off depending on whether the visible group is
  // already fully covered. The helper returns the next set of selected ids so
  // the click handler can stay declarative.
  it("adds the missing ids when the group is partially or not selected", () => {
    const next = diffSelectionForGroup(new Set(["a"]), ["a", "b", "c"]);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("removes the group when every id is already selected", () => {
    const next = diffSelectionForGroup(
      new Set(["a", "b", "c", "z"]),
      ["a", "b", "c"],
    );
    expect([...next]).toEqual(["z"]);
  });

  it("returns the same selection for an empty group", () => {
    const next = diffSelectionForGroup(new Set(["a"]), []);
    expect([...next]).toEqual(["a"]);
  });
});

describe("summarizeBulkOutcome", () => {
  function build(o: Partial<BulkOutcome>): BulkOutcome {
    return {
      requested: o.requested ?? 0,
      updated: o.updated ?? 0,
      failed: o.failed ?? 0,
      failures: o.failures ?? [],
    };
  }

  it("returns a success line when nothing failed", () => {
    const s = summarizeBulkOutcome(build({ requested: 4, updated: 4 }));
    expect(s.tone).toBe("success");
    expect(s.message).toMatch(/4 seguimientos actualizados/);
  });

  it("returns a singular message when only one item was updated", () => {
    const s = summarizeBulkOutcome(build({ requested: 1, updated: 1 }));
    expect(s.message).toMatch(/1 seguimiento actualizado/);
  });

  it("returns a partial-success tone when some failed", () => {
    const s = summarizeBulkOutcome(
      build({
        requested: 3,
        updated: 2,
        failed: 1,
        failures: [{ id: "x", message: "No encontrado" }],
      }),
    );
    expect(s.tone).toBe("partial");
    expect(s.message).toMatch(/2 actualizados/);
    expect(s.message).toMatch(/1 con error/);
  });

  it("returns an error tone when every item failed", () => {
    const s = summarizeBulkOutcome(
      build({
        requested: 2,
        updated: 0,
        failed: 2,
        failures: [
          { id: "a", message: "x" },
          { id: "b", message: "y" },
        ],
      }),
    );
    expect(s.tone).toBe("error");
    expect(s.message).toMatch(/no se pudo actualizar/i);
  });
});
