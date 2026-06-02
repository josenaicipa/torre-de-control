import { describe, expect, it } from "vitest";
import {
  followUpHasWork,
  memberIsEmptyAfterRevert,
  monthlyReportedAt,
  recomputeMemberSnapshot,
  recomputeWeeklyDeltas,
  revertRequiresAdmin,
} from "./comunidad-dropi-revert";

describe("revertRequiresAdmin", () => {
  it("only requires admin for COMPLETED batches", () => {
    expect(revertRequiresAdmin("COMPLETED")).toBe(true);
    expect(revertRequiresAdmin("PENDING")).toBe(false);
    expect(revertRequiresAdmin("PREVIEW_READY")).toBe(false);
    expect(revertRequiresAdmin("CONFIRMING")).toBe(false);
    expect(revertRequiresAdmin("ERRORED")).toBe(false);
  });
});

describe("followUpHasWork", () => {
  it("treats a pristine OPEN auto follow-up as deletable", () => {
    expect(
      followUpHasWork({
        status: "OPEN",
        contactedAt: null,
        outcome: null,
        contactChannel: null,
        result: null,
        notes: null,
        assignedToId: null,
        snoozedUntil: null,
      }),
    ).toBe(false);
  });

  it("blank strings do not count as work", () => {
    expect(
      followUpHasWork({ status: "OPEN", result: "   ", notes: "" }),
    ).toBe(false);
  });

  it("any progress, contact, assignment or note counts as work", () => {
    expect(followUpHasWork({ status: "DONE" })).toBe(true);
    expect(followUpHasWork({ status: "IN_PROGRESS" })).toBe(true);
    expect(followUpHasWork({ status: "OPEN", contactedAt: new Date() })).toBe(
      true,
    );
    expect(followUpHasWork({ status: "OPEN", outcome: "NO_ANSWER" })).toBe(true);
    expect(followUpHasWork({ status: "OPEN", contactChannel: "WHATSAPP" })).toBe(
      true,
    );
    expect(followUpHasWork({ status: "OPEN", assignedToId: "u1" })).toBe(true);
    expect(
      followUpHasWork({ status: "OPEN", snoozedUntil: new Date() }),
    ).toBe(true);
    expect(followUpHasWork({ status: "OPEN", notes: "llamé" })).toBe(true);
    expect(followUpHasWork({ status: "OPEN", result: "vendió" })).toBe(true);
  });
});

describe("recomputeMemberSnapshot", () => {
  it("returns null when no metrics remain", () => {
    expect(recomputeMemberSnapshot([])).toBeNull();
  });

  it("takes current from the latest period and first from the earliest", () => {
    const snap = recomputeMemberSnapshot([
      { reportedAt: new Date("2026-02-15"), segment: "STABLE", priority: "P3" },
      { reportedAt: new Date("2026-04-15"), segment: "GROWING", priority: "P3" },
      { reportedAt: new Date("2026-01-15"), segment: "NEW_SELLER", priority: "P2" },
    ]);
    expect(snap).toEqual({
      currentSegment: "GROWING",
      currentPriority: "P3",
      lastReportedAt: new Date("2026-04-15"),
      firstReportedAt: new Date("2026-01-15"),
    });
  });

  it("handles a single remaining metric", () => {
    const snap = recomputeMemberSnapshot([
      { reportedAt: new Date("2026-03-01"), segment: "ZERO_SALES", priority: "P2" },
    ]);
    expect(snap?.currentSegment).toBe("ZERO_SALES");
    expect(snap?.firstReportedAt).toEqual(new Date("2026-03-01"));
    expect(snap?.lastReportedAt).toEqual(new Date("2026-03-01"));
  });
});

describe("monthlyReportedAt", () => {
  it("returns the last day of the month in UTC", () => {
    expect(monthlyReportedAt(2026, 2).toISOString().slice(0, 10)).toBe(
      "2026-02-28",
    );
    expect(monthlyReportedAt(2024, 2).toISOString().slice(0, 10)).toBe(
      "2024-02-29",
    );
    expect(monthlyReportedAt(2026, 12).toISOString().slice(0, 10)).toBe(
      "2026-12-31",
    );
  });
});

describe("recomputeWeeklyDeltas", () => {
  const week = (
    id: string,
    start: string,
    end: string,
    ordersEntered: number,
    previousOrdersEntered: number | null,
  ) => ({
    id,
    periodStart: new Date(start),
    periodEnd: new Date(end),
    ordersEntered,
    previousOrdersEntered,
  });

  it("rebuilds the previous pointer against the surviving weeks", () => {
    // w1 used to follow a now-deleted week (previous=50); after the revert its
    // real predecessor among the survivors is w0 (40 orders).
    const updates = recomputeWeeklyDeltas([
      week("w0", "2026-01-01", "2026-01-07", 40, null),
      week("w1", "2026-01-15", "2026-01-21", 60, 50),
    ]);
    expect(updates).toEqual([
      {
        id: "w1",
        previousOrdersEntered: 40,
        deltaOrdersEntered: 20,
        deltaOrdersPercent: 50,
      },
    ]);
  });

  it("clears the previous to null when no earlier week survives", () => {
    const updates = recomputeWeeklyDeltas([
      week("w1", "2026-01-15", "2026-01-21", 60, 50),
    ]);
    expect(updates).toEqual([
      {
        id: "w1",
        previousOrdersEntered: null,
        deltaOrdersEntered: null,
        deltaOrdersPercent: null,
      },
    ]);
  });

  it("skips weeks whose previous pointer is unchanged", () => {
    const updates = recomputeWeeklyDeltas([
      week("w0", "2026-01-01", "2026-01-07", 40, null),
      week("w1", "2026-01-15", "2026-01-21", 60, 40),
    ]);
    expect(updates).toEqual([]);
  });

  it("picks the most recent earlier week as the previous", () => {
    const updates = recomputeWeeklyDeltas([
      week("w0", "2026-01-01", "2026-01-07", 10, null),
      week("w1", "2026-01-08", "2026-01-14", 30, 10),
      week("w2", "2026-01-22", "2026-01-28", 45, 10),
    ]);
    expect(updates).toEqual([
      {
        id: "w2",
        previousOrdersEntered: 30,
        deltaOrdersEntered: 15,
        deltaOrdersPercent: 50,
      },
    ]);
  });
});

describe("memberIsEmptyAfterRevert", () => {
  it("is empty only with no metrics, no follow-ups and no linked student", () => {
    expect(
      memberIsEmptyAfterRevert({
        remainingMetricCount: 0,
        remainingFollowUpCount: 0,
        linkedStudentId: null,
      }),
    ).toBe(true);
  });

  it("is preserved when any anchor survives", () => {
    expect(
      memberIsEmptyAfterRevert({
        remainingMetricCount: 1,
        remainingFollowUpCount: 0,
        linkedStudentId: null,
      }),
    ).toBe(false);
    expect(
      memberIsEmptyAfterRevert({
        remainingMetricCount: 0,
        remainingFollowUpCount: 2,
        linkedStudentId: null,
      }),
    ).toBe(false);
    expect(
      memberIsEmptyAfterRevert({
        remainingMetricCount: 0,
        remainingFollowUpCount: 0,
        linkedStudentId: "student-1",
      }),
    ).toBe(false);
  });
});
