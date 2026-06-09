import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const routeSource = () => readFileSync(resolve(appRoot, "src/app/api/dashboard/import/route.ts"), "utf8");

describe("dashboard import audit wiring", () => {
  it("writes audit events that distinguish signed imports from manual dashboard mutations", () => {
    const source = routeSource();

    expect(source).toContain('from "@/lib/audit"');
    expect(source).toContain('source: "dashboard_import_api"');
    expect(source).toContain('action: "dashboard.import"');
    expect(source).toContain("signed");
    expect(source).toContain("daily_closer");
    expect(source).toContain("changedRows");
  });
});
