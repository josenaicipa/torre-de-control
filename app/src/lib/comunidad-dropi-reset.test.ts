import { describe, expect, it, vi } from "vitest";
import {
  RESET_CONFIRM_PHRASE,
  RESET_TABLE_ORDER,
  backupResetTables,
  countResetTables,
  deleteResetTables,
  isConfirmPhraseValid,
  type ResetClient,
} from "./comunidad-dropi-reset";

const DELEGATE_KEYS = [
  "dropiStudentLinkAudit",
  "dropiFollowUp",
  "dropiWeeklyMetric",
  "dropiMonthlyMetric",
  "dropiImportBatch",
  "dropiCommunityMember",
] as const;

function makeClient(
  rowsByKey: Partial<Record<(typeof DELEGATE_KEYS)[number], unknown[]>> = {},
  order: string[] = [],
): ResetClient {
  const client = {} as Record<string, unknown>;
  for (const key of DELEGATE_KEYS) {
    const rows = rowsByKey[key] ?? [];
    client[key] = {
      count: vi.fn(async () => rows.length),
      findMany: vi.fn(async () => rows),
      deleteMany: vi.fn(async () => {
        order.push(key);
        return { count: rows.length };
      }),
    };
  }
  return client as unknown as ResetClient;
}

describe("comunidad-dropi reset", () => {
  it("pins the confirm phrase", () => {
    expect(RESET_CONFIRM_PHRASE).toBe("BORRAR SOLO COMUNIDAD DROPI");
    expect(isConfirmPhraseValid("BORRAR SOLO COMUNIDAD DROPI")).toBe(true);
    expect(isConfirmPhraseValid("borrar solo comunidad dropi")).toBe(false);
    expect(isConfirmPhraseValid(undefined)).toBe(false);
  });

  it("keeps a child-before-parent deletion order", () => {
    expect(RESET_TABLE_ORDER).toEqual([
      "DropiStudentLinkAudit",
      "DropiFollowUp",
      "DropiWeeklyMetric",
      "DropiMonthlyMetric",
      "DropiImportBatch",
      "DropiCommunityMember",
    ]);
  });

  it("counts every table", async () => {
    const client = makeClient({
      dropiFollowUp: [1, 2],
      dropiCommunityMember: [1, 2, 3],
    });
    const counts = await countResetTables(client);
    expect(counts).toEqual({
      DropiStudentLinkAudit: 0,
      DropiFollowUp: 2,
      DropiWeeklyMetric: 0,
      DropiMonthlyMetric: 0,
      DropiImportBatch: 0,
      DropiCommunityMember: 3,
    });
  });

  it("backs up rows and summarizes totals", async () => {
    const client = makeClient({
      dropiWeeklyMetric: [{ id: "w1" }],
      dropiCommunityMember: [{ id: "m1" }, { id: "m2" }],
    });
    const { data, summary } = await backupResetTables(client);
    expect(summary.performed).toBe(true);
    expect(summary.totalRows).toBe(3);
    expect(summary.tables.DropiWeeklyMetric).toBe(1);
    expect(summary.tables.DropiCommunityMember).toBe(2);
    expect(data.DropiCommunityMember).toEqual([{ id: "m1" }, { id: "m2" }]);
  });

  it("deletes tables in the safe order and reports counts", async () => {
    const order: string[] = [];
    const client = makeClient(
      { dropiFollowUp: [1, 2], dropiCommunityMember: [1] },
      order,
    );
    const deleted = await deleteResetTables(client);
    expect(order).toEqual([
      "dropiStudentLinkAudit",
      "dropiFollowUp",
      "dropiWeeklyMetric",
      "dropiMonthlyMetric",
      "dropiImportBatch",
      "dropiCommunityMember",
    ]);
    expect(deleted.DropiFollowUp).toBe(2);
    expect(deleted.DropiCommunityMember).toBe(1);
  });
});
