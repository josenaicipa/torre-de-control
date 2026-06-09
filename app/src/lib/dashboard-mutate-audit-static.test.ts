import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const routeSource = () => readFileSync(resolve(appRoot, "src/app/api/dashboard/mutate/route.ts"), "utf8");

describe("dashboard mutate audit wiring", () => {
  it("writes audit events for dashboard daily mutations with previous-row context", () => {
    const source = routeSource();

    expect(source).toContain('from "@/lib/audit"');
    expect(source).toContain('from "@/lib/dashboard-audit"');
    expect(source).toContain("shouldAuditDashboardMutation");
    expect(source).toContain("findDashboardExistingRow");
    expect(source).toContain("buildDashboardMutationAuditMetadata");
    expect(source).toContain("writeAudit({");
    expect(source).toContain("actorId,");
    expect(source).toContain("result.userId");
    expect(source).toContain('action: `dashboard.${table}.${op}`');
  });
});
