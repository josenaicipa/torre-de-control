import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const shellSource = () =>
  readFileSync(resolve(appRoot, "src/app/operaciones/operations-shell.tsx"), "utf8");
const layoutSource = () => readFileSync(resolve(appRoot, "src/app/layout.tsx"), "utf8");
const cssSource = () => readFileSync(resolve(appRoot, "src/app/globals.css"), "utf8");

describe("operations shell embedded mode", () => {
  it("detecta el modo embebido comparando window.self con window.top", () => {
    const source = shellSource();
    expect(source).toContain("setIsEmbedded(window.self !== window.top)");
  });

  it("no renderiza la sidebar desktop ni el drawer móvil cuando está embebida", () => {
    const source = shellSource();
    // El menú global legacy es el dueño de la navegación dentro del iframe.
    expect(source).toContain("{!isEmbedded && (\n        <aside\n          data-operations-sidebar");
    expect(source).toContain("{!isEmbedded && mobileMenuOpen && (");
    expect(source).toContain('{!isEmbedded && (\n        <aside\n          id="mobile-menu-panel"');
  });

  it("quita el margen izquierdo desktop cuando está embebida para evitar el brinco fantasma", () => {
    const source = shellSource();
    expect(source).toContain('isEmbedded ? "" : "pt-20 md:ml-[220px]"');
  });

  it("marca el overlay móvil para que el CSS embebido lo oculte", () => {
    const source = shellSource();
    expect(source).toContain("data-operations-mobile-overlay");
  });

  it("muestra cerrar sesión en el bloque de cuenta y usa el endpoint existente", () => {
    const source = shellSource();
    expect(source).toContain("LogOut");
    expect(source).toContain("Cerrar sesión");
    expect(source).toContain('fetch("/api/auth/logout", { method: "POST" })');
    expect(source).toContain('router.replace("/login")');
  });
});

describe("detección embebida temprana (antes del primer paint)", () => {
  it("el layout corre un script inline que marca embed-mode de forma síncrona", () => {
    const source = layoutSource();
    // Script inline en <head>: agrega la clase ANTES de pintar el contenido,
    // así nunca se ve el menú Next replicado dentro del iframe.
    expect(source).toContain("dangerouslySetInnerHTML");
    expect(source).toContain("window.self!==window.top");
    expect(source).toContain("document.documentElement.classList.add('embed-mode')");
  });
});

describe("CSS embed-mode", () => {
  it("oculta sidebar, header móvil, overlay y drawer en modo embebido", () => {
    const css = cssSource();
    expect(css).toContain(".embed-mode [data-operations-sidebar]");
    expect(css).toContain(".embed-mode [data-operations-mobile-header]");
    expect(css).toContain(".embed-mode [data-operations-mobile-overlay]");
    expect(css).toContain(".embed-mode #mobile-menu-panel");
  });

  it("quita el margen y padding embebido para usar todo el ancho del iframe", () => {
    const css = cssSource();
    const mainRule = css.slice(css.indexOf(".embed-mode [data-operations-main]"));
    expect(mainRule).toContain("margin-left: 0 !important");
    expect(mainRule).toContain("padding: 16px 24px !important");
  });
});
