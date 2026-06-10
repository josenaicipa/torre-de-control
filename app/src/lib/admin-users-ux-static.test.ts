import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const usersPageSource = () => readFileSync(resolve(appRoot, "src/app/admin/users/page.tsx"), "utf8");

describe("admin users UX", () => {
  it("offers practical permission presets when creating users", () => {
    const source = usersPageSource();

    expect(source).toContain("PERMISSION_PRESETS");
    expect(source).toContain("Tipo de usuario");
    expect(source).toContain("Elige una plantilla");
    expect(source).toContain('name="permissionPreset"');
  });

  it("keeps team summary out of user administration", () => {
    const source = usersPageSource();

    expect(source).not.toContain("summarizeEffectiveAccess");
    expect(source).not.toContain("access-summary");
    expect(source).not.toContain("Alcance efectivo");
  });
});
