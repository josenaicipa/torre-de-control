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
const nuevoForm = () =>
  read("src/app/operaciones/estudiantes/nuevo/nuevo-form.tsx");
const signPage = () => read("src/app/contratos/firmar/[token]/page.tsx");
const signForm = () => read("src/app/contratos/firmar/[token]/sign-form.tsx");
const configPage = () =>
  read("src/app/operaciones/configuracion/page.tsx");
const joseSignatureConfig = () =>
  read("src/app/operaciones/configuracion/jose-signature-config.tsx");
const navItems = () => read("src/app/operaciones/nav-items.ts");
// Los 4 shells estáticos que renderizan el menú: las dos copias servidas por
// Next (public/*) y las dos copias en la raíz del repo (../*). Las cuatro deben
// incluir el link y el gate isInternalOpsConfig para no divergir entre sí.
const menuShells = (): Array<[string, string]> => [
  ["public/index.html", read("public/index.html")],
  ["public/Plataforma/index.html", read("public/Plataforma/index.html")],
  ["../index.html", read("../index.html")],
  ["../Plataforma/index.html", read("../Plataforma/index.html")],
];
const menuAccess = () => read("src/lib/menu-access.ts");

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

describe("UI selector de tipo de contrato (Tradicional / Empresarial)", () => {
  const BUSINESS_HELPER =
    "Este contrato empresarial usa los datos legales del estudiante";

  it("el formulario de nuevo estudiante ofrece el selector y el helper empresarial", () => {
    const source = nuevoForm();
    expect(source).toContain("Tipo de contrato");
    expect(source).toContain("Empresarial");
    expect(source).toContain(BUSINESS_HELPER);
  });

  it("la pestaña de productos ofrece el selector y el helper empresarial", () => {
    const source = productosTab();
    expect(source).toContain("Tipo de contrato");
    expect(source).toContain("Empresarial");
    expect(source).toContain(BUSINESS_HELPER);
  });
});

describe("Menú Operaciones: submenú Configuración", () => {
  it("aparece como hijo de Operaciones en los 4 shells estáticos", () => {
    for (const [name, shell] of menuShells()) {
      expect(
        shell,
        `${name} debe incluir el link de Configuración`,
      ).toContain(
        '{id:"operaciones-configuracion", l:"Configuración", href:"/operaciones/configuracion"}',
      );
      expect(
        shell,
        `${name} debe incluir el gate isInternalOpsConfig`,
      ).toContain("isInternalOpsConfig");
    }
  });

  it("está registrado en la nav Next de Operaciones", () => {
    const source = navItems();
    expect(source).toContain('href: "/operaciones/configuracion"');
    expect(source).toContain('label: "Configuración"');
  });

  it("está en el registry de menús habilitado para acceso operativo", () => {
    const source = menuAccess();
    expect(source).toContain('id: "operaciones-configuracion"');
    // Gated por una capacidad que tiene OPERATOR pero no MENTOR/VIEWER.
    expect(source).toMatch(
      /id: "operaciones-configuracion"[\s\S]*?permissions: \["operaciones\.read", "operaciones\.import"\]/,
    );
  });

  it("la página de configuración existe y limita el acceso a ADMIN/OPERATOR", () => {
    const source = configPage();
    expect(source).toContain('actor.role !== "ADMIN"');
    expect(source).toContain('actor.role !== "OPERATOR"');
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
