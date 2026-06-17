import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const usersPageSource = () => readFileSync(resolve(appRoot, "src/app/admin/users/page.tsx"), "utf8");
const loginPageSource = () => readFileSync(resolve(appRoot, "src/app/login/page.tsx"), "utf8");
const staticDashboardSource = () => readFileSync(resolve(appRoot, "../index.html"), "utf8");
const teamAccessRouteSource = () => readFileSync(resolve(appRoot, "src/app/api/admin/team-access-summary/route.ts"), "utf8");

describe("admin users UX", () => {
  it("uses left-menu tabs as the primary access selector", () => {
    const source = usersPageSource();

    expect(source).not.toContain("PERMISSION_PRESETS");
    expect(source).not.toContain("Plantilla de acceso");
    expect(source).not.toContain("Usar plantilla rápida");
    expect(source).not.toContain('name="permissionPreset"');
    expect(source).not.toContain("preset-select-panel");
    expect(source).not.toContain("<PermissionCheckboxes");
    expect(source).toContain("MENU_ACCESS_ITEMS");
    expect(source).toContain('name="menuAccess"');
    expect(source).toContain("Pestañas habilitadas");
    expect(source).toContain("Acceso visible del menú izquierdo");
    expect(source).toContain("deriveMenuAccessFromPermissions");
    expect(source).toContain("Asignación operativa");
    expect(source).not.toContain("Manual técnico");
    expect(source).not.toContain("manual-advanced-panel");
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

  it("lets admins edit identity and reset temporary passwords for existing users", () => {
    const page = usersPageSource();
    const actions = readFileSync(resolve(appRoot, "src/app/admin/users/actions.ts"), "utf8");

    expect(page).toContain('name="name" defaultValue={user.name ?? ""}');
    expect(page).toContain('name="email" type="email" required defaultValue={user.email}');
    expect(page).toContain('name="password" type="password" minLength={10}');
    expect(page).toContain('name="passwordConfirm" type="password" minLength={10}');

    expect(actions).toContain('const email = String(formData.get("email") ?? "").trim().toLowerCase();');
    expect(actions).toContain('const name = String(formData.get("name") ?? "").trim();');
    expect(actions).toContain('const password = String(formData.get("password") ?? "");');
    expect(actions).toContain('const passwordConfirm = String(formData.get("passwordConfirm") ?? "");');
    expect(actions).toContain('...(password ? { passwordHash: hashPassword(password) } : {})');
    expect(actions).toContain('action: password ? "user.access_updated" : "user.profile_updated"');
  });

  it("shows manual recovery guidance on the login screen", () => {
    const loginPage = loginPageSource();

    expect(loginPage).toContain("¿No puedes ingresar?");
    expect(loginPage).toContain("Contacta al administrador de la Torre de Control");
    expect(loginPage).toContain("restablezca tu acceso");
  });

  it("adds logout to the legacy dashboard shell", () => {
    const dashboard = staticDashboardSource();

    expect(dashboard).toContain("Cerrar sesión");
    expect(dashboard).toContain('fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"})');
    expect(dashboard).toContain('window.location.href="/login"');
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
    expect(dashboard).toContain("menuAccess=new Set");
    expect(dashboard).toContain("filterMenuTab");
    expect(dashboard).toContain("visibleTabs=TABS.map(filterMenuTab).filter(Boolean)");
    expect(dashboard).toContain("visibleMobileTabs=MOBILE_TABS.map(filterMenuTab).filter(Boolean)");
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

  it("falls back to the first routable child when a user only has an Operaciones menu group", () => {
    const dashboard = staticDashboardSource();

    expect(dashboard).toContain("const openFirstVisibleRoute=(fallback)=>");
    expect(dashboard).toContain("else if(fallback.children&&fallback.children[0]?.href)openEmbeddedRoute(fallback.children[0].href,fallback.id)");
    expect(dashboard).toContain("if(current?.children?.length&&!embedUrl)");
    expect(dashboard).toContain("visibleTabs.find(t=>t.href)||visibleTabs.find(t=>t.children&&t.children[0]?.href)");
  });

  it("forces Babel Standalone to compile JSX with the classic React runtime", () => {
    const dashboard = staticDashboardSource();

    expect(dashboard).toContain("Babel.availablePresets.react");
    expect(dashboard).toContain('runtime:\"classic\"');
    expect(dashboard).toContain('text/babel');
  });
});
