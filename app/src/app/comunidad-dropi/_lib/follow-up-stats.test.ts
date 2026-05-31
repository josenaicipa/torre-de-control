import { describe, expect, it } from "vitest";
import {
  buildMemberFollowUpStatus,
  computeRadarFollowUpStats,
  memberFollowUpStateOf,
  type FollowUpStateRow,
  type FollowUpStatsRow,
} from "./follow-up-stats";

const NOW = new Date("2026-05-30T15:00:00.000Z");

function row(overrides: Partial<FollowUpStatsRow>): FollowUpStatsRow {
  return {
    memberId: overrides.memberId ?? "m1",
    status: overrides.status ?? "OPEN",
    priority: overrides.priority ?? "P2",
    dueDate: overrides.dueDate ?? null,
    assignedToId: overrides.assignedToId ?? null,
  };
}

describe("computeRadarFollowUpStats", () => {
  it("returns zero counts on empty input", () => {
    const stats = computeRadarFollowUpStats([], NOW);
    expect(stats).toEqual({
      openCount: 0,
      urgentCount: 0,
      overdueCount: 0,
      todayCount: 0,
      unassignedCount: 0,
    });
  });

  it("ignores DONE and DISMISSED rows", () => {
    const stats = computeRadarFollowUpStats(
      [
        row({ status: "DONE", priority: "P1" }),
        row({ status: "DISMISSED", priority: "P1" }),
      ],
      NOW,
    );
    expect(stats.openCount).toBe(0);
    expect(stats.urgentCount).toBe(0);
  });

  it("counts P1 only when status is active", () => {
    const stats = computeRadarFollowUpStats(
      [
        row({ status: "OPEN", priority: "P1" }),
        row({ status: "IN_PROGRESS", priority: "P1" }),
        row({ status: "DONE", priority: "P1" }),
        row({ status: "OPEN", priority: "P2" }),
      ],
      NOW,
    );
    expect(stats.openCount).toBe(3);
    expect(stats.urgentCount).toBe(2);
  });

  it("buckets overdue strictly before today UTC", () => {
    const stats = computeRadarFollowUpStats(
      [
        row({ dueDate: new Date("2026-05-29T23:59:59.999Z") }),
        row({ dueDate: new Date("2026-05-30T00:00:00.000Z") }),
        row({ dueDate: new Date("2026-05-30T20:00:00.000Z") }),
        row({ dueDate: new Date("2026-05-31T00:00:00.000Z") }),
      ],
      NOW,
    );
    expect(stats.overdueCount).toBe(1);
    expect(stats.todayCount).toBe(2);
    expect(stats.openCount).toBe(4);
  });

  it("counts unassigned rows", () => {
    const stats = computeRadarFollowUpStats(
      [
        row({ assignedToId: null }),
        row({ assignedToId: "u1" }),
        row({ assignedToId: "" }),
      ],
      NOW,
    );
    expect(stats.unassignedCount).toBe(2);
  });

  it("tolerates string dueDate values (Prisma ISO strings)", () => {
    const stats = computeRadarFollowUpStats(
      [row({ dueDate: "2026-05-29T10:00:00.000Z" })],
      NOW,
    );
    expect(stats.overdueCount).toBe(1);
  });
});

describe("buildMemberFollowUpStatus", () => {
  function stateRow(overrides: Partial<FollowUpStateRow>): FollowUpStateRow {
    return {
      memberId: overrides.memberId ?? "m1",
      status: overrides.status ?? "OPEN",
      priority: overrides.priority ?? "P2",
      dueDate: overrides.dueDate ?? null,
      assignedToId: overrides.assignedToId ?? null,
      assignedName: overrides.assignedName ?? null,
    };
  }

  it("marks members with no rows as NONE via the helper", () => {
    const map = buildMemberFollowUpStatus([], NOW);
    expect(memberFollowUpStateOf(map, "ghost").state).toBe("NONE");
    expect(memberFollowUpStateOf(map, "ghost").assignedName).toBeNull();
  });

  it("collapses to OVERDUE when one row is past due", () => {
    const map = buildMemberFollowUpStatus(
      [
        stateRow({
          memberId: "m1",
          status: "IN_PROGRESS",
          dueDate: new Date("2026-05-30T12:00:00.000Z"),
        }),
        stateRow({
          memberId: "m1",
          status: "OPEN",
          dueDate: new Date("2026-05-28T12:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(memberFollowUpStateOf(map, "m1").state).toBe("OVERDUE");
  });

  it("prefers TODAY over IN_PROGRESS", () => {
    const map = buildMemberFollowUpStatus(
      [
        stateRow({
          memberId: "m1",
          status: "IN_PROGRESS",
          dueDate: null,
        }),
        stateRow({
          memberId: "m1",
          status: "OPEN",
          dueDate: new Date("2026-05-30T20:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(memberFollowUpStateOf(map, "m1").state).toBe("TODAY");
  });

  it("keeps assigned name from the first row that carries one", () => {
    const map = buildMemberFollowUpStatus(
      [
        stateRow({ memberId: "m1", assignedName: "Ana" }),
        stateRow({ memberId: "m1", assignedName: "Beto" }),
      ],
      NOW,
    );
    expect(memberFollowUpStateOf(map, "m1").assignedName).toBe("Ana");
  });

  it("ignores DONE and DISMISSED rows", () => {
    const map = buildMemberFollowUpStatus(
      [
        stateRow({ memberId: "m1", status: "DONE" }),
        stateRow({ memberId: "m1", status: "DISMISSED" }),
      ],
      NOW,
    );
    expect(memberFollowUpStateOf(map, "m1").state).toBe("NONE");
  });
});
