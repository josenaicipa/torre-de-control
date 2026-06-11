import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const usersPageSource = () => readFileSync(resolve(appRoot, "src/app/admin/users/page.tsx"), "utf8");
const staticDashboardSource = () => readFileSync(resolve(appRoot, "../index.html"), "utf8");
const teamAccessRouteSource = () => readFileSync(resolve(appRoot, "src/app/api/admin/team-access-summary/route.ts"), "utf8");

describe("admin users UX", () => {
  it("keeps user creation free of access-template complexity", () => {
    const source = usersPageSource();

    expect(source).not.toContain("PERMISSION_PRESETS");
    expect(source).not.toContain("Plantilla de acceso");
    expect(source).not.toContain("Usar plantilla rápida");
    expect(source).not.toContain('name="permissionPreset"');
    expect(source).not.toContain("preset-select-panel");
    expect(source).toContain("Manual avanzado");
    expect(source).toContain("manual-advanced-panel");
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

  it("keeps access-user administration out of Resumen Equipo", () => {
    const dashboard = staticDashboardSource();
    const route = teamAccessRouteSource();

    expect(dashboard).not.toContain("ResumenPermisosEquipo");
    expect(dashboard).not.toContain("/api/admin/team-access-summary");
    expect(dashboard).not.toContain("Resumen por usuario");
    expect(dashboard).not.toContain("Alcance efectivo");
    expect(route).toContain("summarizeEffectiveAccess");
    expect(route).toContain("canManageUsers");
  });

  it("opens Admin directly as embedded Usuarios y permisos, without the legacy Panel Admin", () => {
    const dashboard = staticDashboardSource();

    expect(dashboard).toContain("const openEmbeddedRoute=(href,sectionId)");
    expect(dashboard).toContain("setEmbedUrl(href)");
    expect(dashboard).toContain('href:"/admin/users"');
    expect(dashboard).toContain("openEmbeddedRoute(t.href,t.id)");
    expect(dashboard).toContain("<iframe");
    expect(dashboard).toContain("src={embedUrl}");
    expect(dashboard).not.toContain("const AdminView=");
    expect(dashboard).not.toContain("Administración de usuarios");
    expect(dashboard).not.toContain("Panel Admin");
    expect(dashboard).not.toContain("Visualiza, edita o elimina cualquier entrada del equipo");
    expect(dashboard).not.toContain("onOpenUsers");
    expect(dashboard).not.toContain('href="/admin/users" style={{display:"inline-flex"');
  });
});
