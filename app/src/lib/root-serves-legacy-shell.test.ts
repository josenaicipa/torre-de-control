import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const rootSource = () => readFileSync(resolve(appRoot, "src/app/route.ts"), "utf8");
const loginSource = () =>
  readFileSync(resolve(appRoot, "src/app/api/auth/login/route.ts"), "utf8");

describe("la raíz sirve el shell legacy según permisos", () => {
  it("sirve el HTML legacy (menú Torre) a usuarios con acceso de lectura", () => {
    const source = rootSource();
    expect(source).toContain("readFile");
    expect(source).toContain("text/html");
    expect(source).toContain('join(process.cwd(), "public"');
  });

  it("respeta resolveDashboardAccess antes de servir el shell", () => {
    const source = rootSource();
    expect(source).toContain("resolveDashboardAccess");
    expect(source).toContain("access.canRead");
  });

  it("también sirve el shell a usuarios que solo tienen operaciones.read", () => {
    const source = rootSource();
    expect(source).toContain("canReadDashboardShell");
    expect(source).toContain('actorResult.actor.permissions.includes("operaciones.read")');
  });

  it("no fuerza a /operaciones a los usuarios con dashboard.read", () => {
    // Regresión del bug del commit 3dd9647: la raíz redirigía a /operaciones a
    // todo el mundo, ocultando el menú Torre a quien sí tiene permisos.
    const source = rootSource();
    expect(source).not.toContain('safeAbsoluteUrl(req, "/operaciones")');
  });

  it("manda a /login?next=/ solo cuando no hay sesión", () => {
    const source = rootSource();
    expect(source).toContain("if (!actorResult)");
    expect(source).toContain('safeAbsoluteUrl(req, "/login")');
    expect(source).toContain('loginUrl.searchParams.set("next", "/")');
  });

  it("manda a las cuentas sin acceso al shell a su superficie permitida, no a /login", () => {
    // Regresión: una cuenta autenticada sin dashboard.read ni operaciones.read
    // quedaba con sesión válida pero rebotaba a /login. Ahora la lleva
    // resolveLandingPath (admin de usuarios o fail-safe) sin volver al login.
    // Las cuentas con operaciones.read sí cargan el shell (ver test anterior).
    const source = rootSource();
    expect(source).toContain("if (!canReadDashboardShell(actorResult))");
    expect(source).toContain("resolveLandingPath(actorResult.actor)");
    expect(source).toContain("safeAbsoluteUrl(req, target)");
  });
});

describe("login respeta los permisos en el redirect", () => {
  it("calcula el destino con resolveLandingPath en vez de hardcodearlo", () => {
    const source = loginSource();
    expect(source).toContain("resolveLandingPath");
    expect(source).toContain("permissions: user.permissions");
    // El bug forzaba un destino fijo (todos a "/" o todos a "/operaciones").
    expect(source).not.toContain(': "/";');
    expect(source).not.toContain(': "/operaciones";');
  });
});
