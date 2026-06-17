import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContractView,
  buildPartiesSegments,
  isContractBullet,
  segmentsToText,
  COMPANY,
  INCOMPLETE_LEGAL_DATA,
  type ContractInput,
} from "./operaciones-contract-template";

const appRoot = resolve(__dirname, "..", "..");
const templateSource = () =>
  readFileSync(
    resolve(appRoot, "src/lib/operaciones-contract-template.ts"),
    "utf8",
  );
const pageSource = () =>
  readFileSync(
    resolve(appRoot, "src/app/contratos/firmar/[token]/page.tsx"),
    "utf8",
  );

const baseInput: ContractInput = {
  clientName: "Andrés Toro Sierra",
  clientEmail: "andres@example.com",
  productName: "Mentoría VIP 1 a 1 Dropshipping",
  totalAmountUsd: 2900,
  initialPaymentUsd: 2000,
  balanceUsd: 900,
  installments: [
    { number: 1, amountUsd: 900, currency: "USD", dueDate: "2026-08-11" },
  ],
  agreementDate: "2026-06-11",
  endDate: "2027-06-11",
};

describe("plantilla del contrato real conserva las cláusulas oficiales", () => {
  const KEY_CLAUSES = [
    "CONTRATO DE PRESTACIÓN DE SERVICIOS DE CONSULTORÍA",
    "Kaupi LLC",
    "No solicitud",
    "Jurisdicción",
    "Anexo I",
    "Objeto del contrato",
    "Servicios que presta LA EMPRESA",
    "Confidencialidad",
    "Propiedad intelectual",
    "Protección de datos personales",
    "Cesión de imagen",
    "Personalidad del contrato",
    "Florida",
  ];

  it("el módulo de plantilla contiene todas las cláusulas clave", () => {
    const source = templateSource();
    for (const clause of KEY_CLAUSES) {
      expect(source).toContain(clause);
    }
  });

  it("no quedan rastros del contrato placeholder de prueba", () => {
    const template = templateSource();
    const page = pageSource();
    expect(template).not.toContain("Contrato de prueba interno");
    expect(page).not.toContain("Contrato de prueba interno");
    expect(page).not.toContain("Contrato de prueba");
    expect(page).not.toContain("contrato de prueba");
  });

  it("la vista renderizada incluye las cláusulas clave 2.1-2.11 y firmas", () => {
    const view = buildContractView(baseInput);
    const blob = [
      view.title,
      view.parties,
      view.exponen,
      ...view.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
    ].join("\n");

    for (const clause of KEY_CLAUSES) {
      expect(blob).toContain(clause);
    }
    // Servicios 2.1 hasta 2.11 deben estar presentes.
    for (let i = 1; i <= 11; i += 1) {
      expect(blob).toContain(`2.${i}.`);
    }
    expect(view.signature.clientName).toBe("Andrés Toro Sierra");
    expect(view.signature.ceoName).toContain("Naicipa");
  });
});

describe("plantilla dinamiza honorarios, fechas y partes", () => {
  it("interpola nombre, producto y montos del estudiante", () => {
    const view = buildContractView(baseInput);
    const honorarios = view.sections.find((s) => s.id === "honorarios");
    expect(honorarios).toBeDefined();
    const text = honorarios!.paragraphs.join(" ");
    expect(view.parties).toContain("Andrés Toro Sierra");
    expect(text).toContain("Mentoría VIP 1 a 1 Dropshipping");
    expect(text).toContain("USD $2,900.00");
    expect(text).toContain("USD $2,000.00");
    expect(text).toContain("USD $900.00");
    expect(text).toContain("11 de agosto de 2026");
  });

  it("redacta pago de contado cuando no hay saldo ni cuotas", () => {
    const view = buildContractView({
      ...baseInput,
      initialPaymentUsd: 2900,
      balanceUsd: 0,
      installments: [],
    });
    const honorarios = view.sections.find((s) => s.id === "honorarios")!;
    const text = honorarios.paragraphs.join(" ");
    expect(text).toContain("pago de contado");
    expect(text).not.toContain("saldo restante");
  });

  it("usa el marcador de datos incompletos sin mencionar Torre de Control", () => {
    const view = buildContractView(baseInput);
    expect(view.parties).toContain(INCOMPLETE_LEGAL_DATA);
    expect(view.parties).not.toContain("Torre de Control");
    expect(view.parties).not.toContain("registrado en Torre");
  });

  it("usa el documento y domicilio reales cuando existen, sin frase Torre", () => {
    const view = buildContractView({
      ...baseInput,
      clientDocument: "Cédula de Ciudadanía N° 1.040.046.608",
      clientAddress: "Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia",
    });
    expect(view.parties).toContain("Cédula de Ciudadanía N° 1.040.046.608");
    expect(view.parties).toContain("Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia");
    expect(view.parties).not.toContain("Torre de Control");
    expect(view.parties).not.toContain(INCOMPLETE_LEGAL_DATA);
  });

  it("renderiza las razones de no reembolso (4.6) como viñetas reales", () => {
    const view = buildContractView(baseInput);
    const honorarios = view.sections.find((s) => s.id === "honorarios")!;
    const bullets = honorarios.paragraphs.filter((p) => isContractBullet(p));
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(
      bullets.some((b) => b.includes("clases grupales")),
    ).toBe(true);
  });

  it("formatea la fecha de finalización derivada de los datos del estudiante", () => {
    const view = buildContractView(baseInput);
    expect(view.signature.endDateLabel).toBe("11 de junio de 2027");
  });

  it("muestra guion cuando no hay fecha de finalización disponible", () => {
    const view = buildContractView({ ...baseInput, endDate: null });
    expect(view.signature.endDateLabel).toBe("—");
  });
});

describe("segmentos de la cláusula Reunidos con negritas", () => {
  it("la concatenación de segmentos coincide con view.parties (datos completos)", () => {
    const completo: ContractInput = {
      ...baseInput,
      clientDocument: "Cédula de Ciudadanía N° 1.040.046.608",
      clientAddress: "Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia",
    };
    const view = buildContractView(completo);
    expect(segmentsToText(buildPartiesSegments(completo))).toBe(view.parties);
  });

  it("la concatenación de segmentos coincide con view.parties (datos incompletos)", () => {
    const view = buildContractView(baseInput);
    expect(segmentsToText(buildPartiesSegments(baseInput))).toBe(view.parties);
    // Sin documento/domicilio reales, los segmentos en negrita usan el marcador.
    const bold = buildPartiesSegments(baseInput)
      .filter((s) => s.bold)
      .map((s) => s.text);
    expect(bold).toContain(INCOMPLETE_LEGAL_DATA);
  });

  it("resalta en negrita empresa, EIN, dirección, cliente, documento y domicilio", () => {
    const completo: ContractInput = {
      ...baseInput,
      clientDocument: "Cédula de Ciudadanía N° 1.040.046.608",
      clientAddress: "Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia",
    };
    const bold = buildPartiesSegments(completo)
      .filter((s) => s.bold)
      .map((s) => s.text);
    expect(bold).toContain(COMPANY.legalName);
    expect(bold).toContain(COMPANY.ein);
    expect(bold).toContain(COMPANY.address);
    expect(bold).toContain("Andrés Toro Sierra");
    expect(bold).toContain("Cédula de Ciudadanía N° 1.040.046.608");
    expect(bold).toContain("Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia");
    // Los conectores en minúscula no deben ir en negrita.
    const normal = buildPartiesSegments(completo)
      .filter((s) => !s.bold)
      .map((s) => s.text)
      .join("");
    expect(normal).toContain("De una parte, ");
    expect(normal).toContain("Y, de otra parte, ");
  });
});
