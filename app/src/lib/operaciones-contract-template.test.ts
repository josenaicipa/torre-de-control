import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContractView,
  buildPartiesSegments,
  contractBulletText,
  isContractBullet,
  parseContractSegments,
  segmentsToText,
  COMPANY,
  INCOMPLETE_LEGAL_DATA,
  type ContractInput,
  type ContractSection,
  type ManualClause,
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
  durationMonths: 12,
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

  it("resalta en negrita los datos variables del párrafo de pagos", () => {
    const honorarios = buildContractView(baseInput).sections.find(
      (s) => s.id === "honorarios",
    )!;
    const abono = honorarios.paragraphs.find((p) => p.includes("valor pagado"))!;
    const segments = parseContractSegments(abono);
    const bold = segments.filter((s) => s.bold).map((s) => s.text);
    // Valor pagado, saldo restante, monto de cuota y fecha de cuota en negrita.
    expect(bold).toContain("USD $2,000.00");
    expect(bold).toContain("USD $900.00");
    expect(bold).toContain("11 de agosto de 2026");
    // Los conectores siguen en texto normal, no en negrita.
    const normal = segments.filter((s) => !s.bold).map((s) => s.text).join("");
    expect(normal).toContain("ha realizado abonos por un valor pagado de");
    expect(normal).toContain("El saldo restante por valor de");
    expect(normal).toContain("calendario de pagos:");
  });

  it("renderiza la cláusula 2.11 (implementación inicial) como viñetas reales", () => {
    const servicios = buildContractView(baseInput).sections.find(
      (s) => s.id === "servicios",
    )!;
    const bullets = servicios.paragraphs
      .filter((p) => isContractBullet(p))
      .map((p) => contractBulletText(p));
    expect(bullets.some((b) => b.includes("tienda online"))).toBe(true);
    expect(bullets.some((b) => b.includes("producto inicial"))).toBe(true);
    expect(bullets.some((b) => b.includes("piezas creativas"))).toBe(true);
    expect(bullets.some((b) => b.includes("landing page"))).toBe(true);
    expect(bullets.some((b) => b.includes("Dropify"))).toBe(true);
    // El encabezado 2.11 sigue presente y la lista ya no queda pegada con ";".
    const intro = servicios.paragraphs.find((p) => p.includes("2.11."))!;
    expect(intro).toContain("podrá incluir exclusivamente:");
    expect(intro).not.toContain("homepage); implementación");
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

describe("buildContractView con snapshot de contrato completo", () => {
  const snapshot: ContractSection[] = [
    {
      id: "custom-objeto",
      heading: "Primera. Objeto personalizado",
      paragraphs: ["Cláusula objeto reescrita para esta inscripción."],
    },
    {
      id: "custom-cierre",
      heading: "Segunda. Cierre personalizado",
      paragraphs: ["Párrafo final personalizado."],
    },
  ];

  it("usa el snapshot completo y reemplaza plantilla oficial + cláusulas manuales", () => {
    const manual: ManualClause = {
      heading: "Cláusula manual que NO debe anexarse",
      paragraphs: ["Texto que no debe aparecer."],
    };
    const view = buildContractView({
      ...baseInput,
      manualClauses: [manual],
      sectionsSnapshot: snapshot,
    });

    expect(view.sections).toEqual(snapshot);
    // No quedan secciones oficiales ni cláusulas manuales encima.
    expect(view.sections.some((s) => s.id === "objeto")).toBe(false);
    expect(view.sections.some((s) => s.id === "honorarios")).toBe(false);
    expect(view.sections.some((s) => s.id.startsWith("manual-"))).toBe(false);
    expect(view.sections.some((s) => s.heading === manual.heading)).toBe(false);
  });

  it("cae a la plantilla oficial cuando el snapshot es [] o null", () => {
    const withEmpty = buildContractView({ ...baseInput, sectionsSnapshot: [] });
    const withNull = buildContractView({ ...baseInput, sectionsSnapshot: null });
    for (const view of [withEmpty, withNull]) {
      expect(view.sections.some((s) => s.id === "objeto")).toBe(true);
      expect(view.sections.some((s) => s.id === "honorarios")).toBe(true);
      expect(view.sections.some((s) => s.id === "custom-objeto")).toBe(false);
    }
  });
});

describe("plantilla empresarial (BUSINESS) vs tradicional", () => {
  it("BUSINESS usa el subtítulo «Unlocked Academy Empresarial» y la cláusula Tercera empresarial", () => {
    const view = buildContractView({ ...baseInput, templateKind: "BUSINESS" });
    expect(view.subtitle).toBe("Unlocked Academy Empresarial");
    const headings = view.sections.map((s) => s.heading);
    expect(headings).toContain(
      "Tercera. DESCRIPCIÓN DEL PROGRAMA DE TRANSFORMACIÓN EMPRESARIAL",
    );
  });

  it("sin templateKind cae al tradicional con subtítulo «Unlocked Academy»", () => {
    const view = buildContractView(baseInput);
    expect(view.subtitle).toBe("Unlocked Academy");
    const headings = view.sections.map((s) => s.heading);
    expect(headings).not.toContain(
      "Tercera. DESCRIPCIÓN DEL PROGRAMA DE TRANSFORMACIÓN EMPRESARIAL",
    );
  });
});

describe("contrato de equipo con integrantes adicionales", () => {
  const teamInput: ContractInput = {
    ...baseInput,
    teamMembers: [
      {
        fullName: "Beatriz Gómez Ruiz",
        email: "beatriz@example.com",
        isContractSigner: true,
      },
      {
        fullName: "Carlos Pérez Lima",
        email: "carlos@example.com",
        isContractSigner: false,
      },
    ],
  };

  it("sin teamMembers conserva parties y deja solo al titular como firmante", () => {
    const view = buildContractView(baseInput);
    expect(view.parties).toBe(segmentsToText(buildPartiesSegments(baseInput)));
    expect(view.parties).not.toContain("integrantes:");
    expect(view.signature.signerNames).toEqual(["Andrés Toro Sierra"]);
  });

  it("incluye el conteo total y la lista de integrantes en las partes", () => {
    const view = buildContractView(teamInput);
    expect(view.parties).toContain(
      "EL CLIENTE está conformado por 3 integrantes:",
    );
    expect(view.parties).toContain("Andrés Toro Sierra");
    expect(view.parties).toContain("Beatriz Gómez Ruiz");
    expect(view.parties).toContain("Carlos Pérez Lima");
    // Los segmentos siguen coincidiendo con el string plano firmado.
    expect(segmentsToText(buildPartiesSegments(teamInput))).toBe(view.parties);
  });

  it("signerNames incluye al titular y solo a los miembros marcados", () => {
    const view = buildContractView(teamInput);
    expect(view.signature.signerNames).toEqual([
      "Andrés Toro Sierra",
      "Beatriz Gómez Ruiz",
    ]);
    expect(view.signature.signerNames).not.toContain("Carlos Pérez Lima");
  });

  it("muestra el documento de cada integrante en REUNIDOS cuando está presente", () => {
    const view = buildContractView({
      ...baseInput,
      teamMembers: [
        {
          fullName: "Beatriz Gómez Ruiz",
          isContractSigner: true,
          documentType: "CC",
          documentNumber: "123456",
        },
        {
          fullName: "Carlos Pérez Lima",
          isContractSigner: false,
          documentNumber: "987654",
        },
      ],
    });
    expect(view.parties).toContain(
      "Beatriz Gómez Ruiz identificado con CC N° 123456",
    );
    expect(view.parties).toContain(
      "Carlos Pérez Lima identificado con 987654",
    );
  });

  it("solo el titular firma cuando ningún integrante está marcado", () => {
    const view = buildContractView({
      ...baseInput,
      teamMembers: [{ fullName: "Beatriz Gómez Ruiz", isContractSigner: false }],
    });
    expect(view.parties).toContain("2 integrantes:");
    expect(view.signature.signerNames).toEqual(["Andrés Toro Sierra"]);
  });
});

describe("parseContractSegments separa negritas inline de los párrafos", () => {
  it("texto plano sin marcadores devuelve un solo segmento normal", () => {
    const segments = parseContractSegments("solo texto plano");
    expect(segments).toEqual([{ text: "solo texto plano", bold: false }]);
  });

  it("extrae los fragmentos marcados como negrita y deja el resto normal", () => {
    const segments = parseContractSegments("abono de ⟦USD $2,000.00⟧ y saldo ⟦USD $900.00⟧.");
    expect(segments.filter((s) => s.bold).map((s) => s.text)).toEqual([
      "USD $2,000.00",
      "USD $900.00",
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(
      "abono de USD $2,000.00 y saldo USD $900.00.",
    );
  });
});
