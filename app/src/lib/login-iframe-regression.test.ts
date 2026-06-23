import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const loginFormSource = () =>
  readFileSync(resolve(appRoot, "src/app/login/login-form.tsx"), "utf8");
const loginPageSource = () =>
  readFileSync(resolve(appRoot, "src/app/login/page.tsx"), "utf8");
const publicShellSource = () =>
  readFileSync(resolve(appRoot, "public/index.html"), "utf8");

describe("login-form rompe el iframe tras autenticar", () => {
  it("detecta si quedó embebido comparando window.self con window.top", () => {
    const source = loginFormSource();
    expect(source).toContain("window.self !== window.top");
  });

  it("navega la ventana superior con window.top.location.replace al destino", () => {
    const source = loginFormSource();
    expect(source).toContain("window.top.location.replace(dest)");
  });

  it("descarta URLs externas y protocol-relative antes de redirigir", () => {
    const source = loginFormSource();
    // Solo destinos internos: empieza con "/" pero no "//host".
    expect(source).toContain('!raw.startsWith("//")');
    expect(source).toContain('raw.startsWith("/")');
  });
});

describe("login/page rompe el frame antes del primer paint", () => {
  it("inyecta un script anti-frame que compara window.self con window.top", () => {
    const source = loginPageSource();
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("window.self===window.top");
    expect(source).toContain("window.top.location.replace");
  });

  it("sanitiza el next antes de mandarlo en /login?next=", () => {
    const source = loginPageSource();
    expect(source).toContain("'/login?next='+encodeURIComponent(");
    // El next solo se acepta si es ruta interna (empieza con "/" y no "//").
    expect(source).toContain("charAt(0)==='/'");
    expect(source).toContain("charAt(1)!=='/'");
  });
});

describe("shell legacy detecta el login embebido", () => {
  it("registra un onLoad en el iframe embebido", () => {
    const source = publicShellSource();
    expect(source).toContain("onLoad={");
  });

  it("rompe el frame al detectar /login dentro del iframe", () => {
    const source = publicShellSource();
    expect(source).toContain('p==="/login"');
    expect(source).toContain('p.indexOf("/login")===0');
    expect(source).toContain('window.location.href="/login?next=/"');
  });
});
