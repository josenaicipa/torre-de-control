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

  it("manda a /login?next=/ a quien no tiene acceso", () => {
    const source = rootSource();
    expect(source).toContain('safeAbsoluteUrl(req, "/login")');
    expect(source).toContain('loginUrl.searchParams.set("next", "/")');
  });
});

describe("login respeta los permisos en el redirect", () => {
  it("manda a los no-MENTOR a la raíz para que el menú respete los permisos", () => {
    const source = loginSource();
    expect(source).toContain(': "/";');
    // El bug forzaba /operaciones como destino por defecto: no debe volver.
    expect(source).not.toContain(': "/operaciones";');
  });

  it("mantiene a los MENTOR (no ADMIN) en /operaciones/mis-estudiantes", () => {
    const source = loginSource();
    expect(source).toContain('"/operaciones/mis-estudiantes"');
    expect(source).toContain('user.role === "MENTOR" && user.position !== "ADMIN"');
  });
});
