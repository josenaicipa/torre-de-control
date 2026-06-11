import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const shellSource = () =>
  readFileSync(resolve(appRoot, "src/app/operaciones/operations-shell.tsx"), "utf8");

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
});
