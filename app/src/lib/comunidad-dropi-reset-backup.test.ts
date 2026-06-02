import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backupReplacer,
  resolveBackupDir,
  serializeBackup,
} from "./comunidad-dropi-reset-backup";
import type { ResetTableName } from "./comunidad-dropi-reset";

function emptyData(): Record<ResetTableName, unknown[]> {
  return {
    DropiStudentLinkAudit: [],
    DropiFollowUp: [],
    DropiWeeklyMetric: [],
    DropiMonthlyMetric: [],
    DropiImportBatch: [],
    DropiCommunityMember: [],
  };
}

describe("comunidad-dropi reset backup", () => {
  it("uses RESET_BACKUP_DIR when set", () => {
    expect(resolveBackupDir({ RESET_BACKUP_DIR: "/data/backups" })).toBe(
      "/data/backups",
    );
    expect(resolveBackupDir({ RESET_BACKUP_DIR: "  /data/backups  " })).toBe(
      "/data/backups",
    );
  });

  it("falls back to the OS temp dir, never app/backups", () => {
    const dir = resolveBackupDir({});
    expect(dir).toBe(path.join(os.tmpdir(), "comunidad-dropi-backups"));
    expect(dir).not.toContain(path.join(process.cwd(), "backups"));
  });

  it("treats blank RESET_BACKUP_DIR as unset", () => {
    expect(resolveBackupDir({ RESET_BACKUP_DIR: "   " })).toBe(
      path.join(os.tmpdir(), "comunidad-dropi-backups"),
    );
  });

  it("serializes BigInt without throwing", () => {
    expect(backupReplacer("x", 42n)).toBe("42");
    const data = emptyData();
    data.DropiCommunityMember = [{ id: "m1", legacyId: 9007199254740993n }];
    const json = serializeBackup(data);
    expect(JSON.parse(json).DropiCommunityMember[0].legacyId).toBe(
      "9007199254740993",
    );
  });

  it("serializes Date as an ISO string", () => {
    const data = emptyData();
    data.DropiFollowUp = [{ createdAt: new Date("2026-06-02T10:00:00.000Z") }];
    const json = serializeBackup(data);
    expect(JSON.parse(json).DropiFollowUp[0].createdAt).toBe(
      "2026-06-02T10:00:00.000Z",
    );
  });

  it("serializes Decimal-like values via their string form", () => {
    class Decimal {
      constructor(private readonly raw: string) {}
      toString() {
        return this.raw;
      }
    }
    expect(backupReplacer("amount", new Decimal("123.45"))).toBe("123.45");
    const data = emptyData();
    data.DropiMonthlyMetric = [{ total: new Decimal("999.99") }];
    const json = serializeBackup(data);
    expect(JSON.parse(json).DropiMonthlyMetric[0].total).toBe("999.99");
  });
});
