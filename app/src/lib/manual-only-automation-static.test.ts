import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "..");

describe("manual-only commercial daily data automation guard", () => {
  it("keeps dashboard imports from accepting daily_closer or daily_entries", () => {
    const source = readFileSync(resolve(appRoot, "src/lib/dashboard-store.ts"), "utf8");
    expect(source).toContain("isExternalImportAllowedTable");
    expect(source).not.toContain('"daily_entries",\n  "ads_entries",\n  "daily_closer"');
  });

  it("disables the legacy metrics-to-daily_closer writer path", () => {
    const source = readFileSync(resolve(repoRoot, "scripts/sync-auto-crm-revenue-to-supabase.py"), "utf8");
    expect(source).toContain("MANUAL_ONLY_DAILY_CLOSER_SYNC_DISABLED");
    expect(source).toContain("Daily commercial fields are manual-only");
  });
});
