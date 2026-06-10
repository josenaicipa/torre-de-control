import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const usersPageSource = () => readFileSync(resolve(appRoot, "src/app/admin/users/page.tsx"), "utf8");
const staticDashboardSource = () => readFileSync(resolve(appRoot, "../index.html"), "utf8");
const teamAccessRouteSource = () => readFileSync(resolve(appRoot, "src/app/api/admin/team-access-summary/route.ts"), "utf8");

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

  it("renders existing users as a collapsed summary list", () => {
    const source = usersPageSource();

    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain("Ver / editar");
    expect(source).toContain("user-summary-line");
    expect(source).not.toContain("<article className={`card user-row");
  });

  it("moves the per-user access summary into Resumen Equipo", () => {
    const dashboard = staticDashboardSource();
    const route = teamAccessRouteSource();

    expect(dashboard).toContain("ResumenPermisosEquipo");
    expect(dashboard).toContain("/api/admin/team-access-summary");
    expect(dashboard).toContain("Resumen por usuario");
    expect(dashboard).toContain("Alcance efectivo");
    expect(route).toContain("summarizeEffectiveAccess");
    expect(route).toContain("canManageUsers");
  });
});
