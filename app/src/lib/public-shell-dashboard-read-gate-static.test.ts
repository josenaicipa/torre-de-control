import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const shellHtml = () => readFileSync(resolve(appRoot, "public/index.html"), "utf8");

describe("el shell legacy respeta capabilities.canRead", () => {
  it("espera a que cargue la identidad antes de leer datos comerciales", () => {
    const html = shellHtml();
    expect(html).toContain("const [meLoaded,setMeLoaded]=useState(false)");
    expect(html).toContain("setMeLoaded(true)");
  });

  it("no consulta las tablas comerciales cuando canRead es false", () => {
    // Regresión: una cuenta operaciones-only embebida disparaba el select del
    // dashboard, recibía 403 y mostraba un error en una pantalla que solo debe
    // ofrecerle su menú de Operaciones.
    const html = shellHtml();
    expect(html).toContain("me.capabilities.canRead!==false");
    expect(html).toContain("if(!canReadDash){setReady(true);return;}");
  });

  it("vuelve a evaluar la carga cuando llega la identidad", () => {
    const html = shellHtml();
    // El effect de datos depende de meLoaded/me para decidir si lee o no.
    expect(html).toContain("},[meLoaded,me]);");
  });

  it("sigue cargando los datos comerciales para lectores del dashboard", () => {
    const html = shellHtml();
    expect(html).toContain('db.from("kpi_data").select("*")');
    expect(html).toContain('db.from("daily_entries").select("*")');
  });
});
