import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regresiones de los textos/botones de la UI del flujo de contrato. Se leen
// los archivos fuente para verificar que los rótulos visibles al usuario y al
// operador coincidan con lo acordado, sin depender de renderizar React.
const appRoot = resolve(__dirname, "..", "..");
const read = (relative: string) =>
  readFileSync(resolve(appRoot, relative), "utf8");

const productosTab = () =>
  read("src/app/operaciones/estudiantes/[id]/productos-tab.tsx");
const signPage = () => read("src/app/contratos/firmar/[token]/page.tsx");
const signForm = () => read("src/app/contratos/firmar/[token]/sign-form.tsx");

describe("UI productos-tab: firma y aprobación de Jose Naicipa", () => {
  it("el botón de aprobar firma explícitamente como Jose Naicipa", () => {
    const source = productosTab();
    expect(source).toContain("Firmar como Jose Naicipa y aprobar contrato");
    expect(source).not.toContain("Aprobar contrato y liberar acceso");
  });

  it("muestra que el contrato quedó firmado por Jose Naicipa al aprobar", () => {
    expect(productosTab()).toContain("Firmado por Jose Naicipa");
  });

  it("el botón de PDF aprobado es explícito sobre el contrato firmado", () => {
    const source = productosTab();
    expect(source).toContain("Descargar PDF del contrato firmado");
    expect(source).not.toContain(">Descargar PDF firmado<");
  });

  it("informa cuando el PDF aún espera la firma de Jose Naicipa", () => {
    expect(productosTab()).toContain(
      "PDF disponible después de la firma de Jose Naicipa",
    );
  });

  it("explica dónde y cuándo firma Jose Naicipa según estado y permisos", () => {
    const source = productosTab();
    expect(source).toContain("JoseSignatureHint");
    // Ubicación interna del flujo de firma de Jose.
    expect(source).toContain("Operaciones › Estudiante › Producto");
    // Estado: el estudiante ya firmó y falta la firma de Jose.
    expect(source).toContain("El estudiante ya firmó");
    // Caso sin permisos.
    expect(source).toContain("No tienes permisos para firmar como Jose Naicipa");
  });
});

describe("UI página pública de firma", () => {
  it("muestra la card de paso final para subir y firmar", () => {
    expect(signPage()).toContain(
      "Paso final: sube la foto de tu firma y firma el contrato",
    );
  });

  it("renderiza las partes con negrita usando segmentos, no el string plano", () => {
    const source = signPage();
    expect(source).toContain("buildPartiesSegments");
    expect(source).toContain("PartiesText");
    expect(source).not.toContain("<p className=\"mt-1\">{contract.parties}</p>");
  });

  it("el input de firma está destacado con el rótulo solicitado", () => {
    expect(signForm()).toContain("Subir imagen de firma (PNG/JPG)");
  });

  it("no quedan rastros del contrato placeholder de prueba (Torre)", () => {
    const page = signPage();
    expect(page).not.toContain("Contrato de prueba");
    expect(page).not.toContain("registrado en Torre");
  });
});
