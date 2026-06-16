import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const rootSource = () => readFileSync(resolve(appRoot, "src/app/route.ts"), "utf8");
const loginSource = () =>
  readFileSync(resolve(appRoot, "src/app/api/auth/login/route.ts"), "utf8");

describe("raíz ya no sirve el shell legacy blanco", () => {
  it("no lee ni sirve el HTML legacy desde el sistema de archivos", () => {
    const source = rootSource();
    expect(source).not.toContain("readFile");
    expect(source).not.toContain("text/html");
    expect(source).not.toContain('join(process.cwd(), "public"');
  });

  it("redirige a /operaciones a los usuarios autenticados con acceso", () => {
    const source = rootSource();
    expect(source).toContain('safeAbsoluteUrl(req, "/operaciones")');
  });

  it("sigue mandando a /login?next=/ a quien no tiene acceso", () => {
    const source = rootSource();
    expect(source).toContain('safeAbsoluteUrl(req, "/login")');
    expect(source).toContain('loginUrl.searchParams.set("next", "/")');
  });
});

describe("login redirige a /operaciones para no-MENTOR", () => {
  it("usa /operaciones como destino por defecto en vez de la raíz", () => {
    const source = loginSource();
    expect(source).toContain(': "/operaciones"');
    expect(source).not.toContain(': "/";');
  });

  it("mantiene a los MENTOR (no ADMIN) en /operaciones/mis-estudiantes", () => {
    const source = loginSource();
    expect(source).toContain('"/operaciones/mis-estudiantes"');
    expect(source).toContain('user.role === "MENTOR" && user.position !== "ADMIN"');
  });
});
