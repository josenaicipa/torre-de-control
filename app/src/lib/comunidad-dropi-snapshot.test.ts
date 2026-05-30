import { describe, expect, it } from "vitest";
import { computeMemberSnapshotPatch } from "./comunidad-dropi-snapshot";

describe("computeMemberSnapshotPatch", () => {
  it("refreshes snapshot when no prior period has been seen", () => {
    const patch = computeMemberSnapshotPatch({
      currentFirstReportedAt: null,
      currentLastReportedAt: null,
      periodReportedAt: new Date("2026-05-15"),
      newSegment: "STABLE",
      newPriority: "P3",
    });
    expect(patch.refreshCurrent).toBe(true);
    expect(patch.currentSegment).toBe("STABLE");
    expect(patch.currentPriority).toBe("P3");
    expect(patch.lastReportedAt?.toISOString()).toBe(
      new Date("2026-05-15").toISOString(),
    );
    expect(patch.updateFirstReportedAt).toBe(true);
    expect(patch.firstReportedAt?.toISOString()).toBe(
      new Date("2026-05-15").toISOString(),
    );
  });

  it("refreshes snapshot when imported period is newer than last seen", () => {
    const patch = computeMemberSnapshotPatch({
      currentFirstReportedAt: new Date("2026-04-01"),
      currentLastReportedAt: new Date("2026-05-01"),
      periodReportedAt: new Date("2026-05-15"),
      newSegment: "DROPPING",
      newPriority: "P1",
    });
    expect(patch.refreshCurrent).toBe(true);
    expect(patch.currentSegment).toBe("DROPPING");
    expect(patch.currentPriority).toBe("P1");
    expect(patch.lastReportedAt?.toISOString()).toBe(
      new Date("2026-05-15").toISOString(),
    );
    expect(patch.updateFirstReportedAt).toBe(false);
    expect(patch.firstReportedAt).toBeNull();
  });

  it("protects snapshot when reimporting an older period", () => {
    const patch = computeMemberSnapshotPatch({
      currentFirstReportedAt: new Date("2026-03-01"),
      currentLastReportedAt: new Date("2026-05-20"),
      periodReportedAt: new Date("2026-04-15"),
      newSegment: "ZERO_SALES",
      newPriority: "P2",
    });
    expect(patch.refreshCurrent).toBe(false);
    expect(patch.currentSegment).toBeNull();
    expect(patch.currentPriority).toBeNull();
    expect(patch.lastReportedAt).toBeNull();
    expect(patch.updateFirstReportedAt).toBe(false);
    expect(patch.firstReportedAt).toBeNull();
  });

  it("lowers firstReportedAt when imported period predates the earliest seen", () => {
    const patch = computeMemberSnapshotPatch({
      currentFirstReportedAt: new Date("2026-04-01"),
      currentLastReportedAt: new Date("2026-05-20"),
      periodReportedAt: new Date("2026-02-15"),
      newSegment: "LOW_VOLUME",
      newPriority: "P2",
    });
    expect(patch.refreshCurrent).toBe(false);
    expect(patch.updateFirstReportedAt).toBe(true);
    expect(patch.firstReportedAt?.toISOString()).toBe(
      new Date("2026-02-15").toISOString(),
    );
  });

  it("refreshes when re-importing the same period (e.g. corrected file)", () => {
    const patch = computeMemberSnapshotPatch({
      currentFirstReportedAt: new Date("2026-04-01"),
      currentLastReportedAt: new Date("2026-05-20"),
      periodReportedAt: new Date("2026-05-20"),
      newSegment: "GROWING",
      newPriority: "P3",
    });
    // Re-importing the SAME period with corrected rows should still update
    // the snapshot; only strictly older periods are blocked.
    expect(patch.refreshCurrent).toBe(true);
    expect(patch.currentSegment).toBe("GROWING");
    expect(patch.currentPriority).toBe("P3");
  });
});
