import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContractInputFromData,
  buildContractSignersSummary,
  buildContractTemplateResetData,
  canChangeContractTemplateKind,
  computeCeoSignatureHash,
  computeSignaturesSummaryHash,
  computeStudentSignatureHash,
  CONTRACT_HOLDER_SIGNER_ID,
  contractSignerMembers,
  findMissingContractFields,
  isContractComplete,
  MANUAL_CLAUSE_LIMITS,
  CONTRACT_SECTIONS_LIMITS,
  namesReasonablyMatch,
  parseContractSections,
  parseContractSectionsSnapshot,
  parseManualClauses,
  parseManualClausesSnapshot,
  serializeContractSectionsSnapshot,
  serializeManualClausesSnapshot,
  validateSignatureImage,
  type ContractDataShape,
} from "./operaciones-contract";
import {
  buildContractView,
  type ContractSection,
  type ManualClause,
} from "./operaciones-contract-template";
import { validateManualClausesInput } from "./operaciones-manual-clauses";

// PNG 1x1 transparente válido, suficiente para los tests del validador y el PDF.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2Q==";

const appRoot = resolve(__dirname, "..", "..");

function completeData(overrides?: Partial<ContractDataShape>): ContractDataShape {
  return {
    student: {
      fullName: "Andrés Toro Sierra",
      legalName: "Andrés Toro Sierra",
      email: "andres@example.com",
      phone: "+57 300 1234567",
      documentType: "Cédula de Ciudadanía",
      documentNumber: "1.040.046.608",
      legalAddress: "Carrera 27 # 7b - 145",
      legalCity: "Medellín",
      legalState: "Antioquia",
      legalCountry: "Colombia",
      durationMonths: 12,
      startDate: "2026-06-11",
      endDate: "2027-06-11",
    },
    product: { name: "Mentoría VIP 1 a 1 Dropshipping" },
    totalAmountUsd: 2900,
    initialPaymentUsd: 2000,
    balanceUsd: 900,
    startedAt: "2026-06-11",
    endsAt: "2027-06-11",
    paymentSchedules: [
      {
        installmentNumber: 1,
        amountDue: 900,
        currency: "USD",
        dueDate: "2026-08-11",
      },
    ],
    ...overrides,
  };
}

// Caso real de cartera importada: el estudiante tenía cuotas/pagos manuales a
// nivel estudiante (sin enrollment ligado). Luego se agregó el producto y se
// borraron los planes automáticos, dejando la inscripción sin cronograma ni
// pagos propios, con initialPaymentUsd null y un balanceUsd stale que no
// refleja lo manual. Programa 3000, pagos 100+900, cuotas 100/900/1000/1000.
function legacyData(): ContractDataShape {
  return {
    ...completeData(),
    totalAmountUsd: 3000,
    initialPaymentUsd: null,
    balanceUsd: 2900,
    paymentSchedules: [],
    payments: [],
    student: {
      ...completeData().student,
      paymentSchedules: [
        { installmentNumber: 1, amountDue: 100, currency: "USD", dueDate: "2026-07-11" },
        { installmentNumber: 2, amountDue: 900, currency: "USD", dueDate: "2026-08-11" },
        { installmentNumber: 3, amountDue: 1000, currency: "USD", dueDate: "2026-09-11" },
        { installmentNumber: 4, amountDue: 1000, currency: "USD", dueDate: "2026-10-11" },
      ],
      payments: [
        { amount: 100, currency: "USD" },
        { amount: 900, currency: "USD" },
      ],
    },
  };
}

describe("findMissingContractFields", () => {
  it("reporta documento, dirección, ciudad, departamento, país y teléfono faltantes, y cronograma si hay saldo > 0", () => {
    const data = completeData({
      student: {
        ...completeData().student,
        phone: null,
        documentType: null,
        documentNumber: null,
        legalAddress: null,
        legalCity: null,
        legalState: null,
        legalCountry: null,
      },
      paymentSchedules: [],
    });

    const missing = findMissingContractFields(data);
    const fields = missing.map((m) => m.field);

    expect(fields).toContain("phone");
    expect(fields).toContain("documentType");
    expect(fields).toContain("documentNumber");
    expect(fields).toContain("legalAddress");
    expect(fields).toContain("legalCity");
    expect(fields).toContain("legalState");
    expect(fields).toContain("legalCountry");
    // Con saldo > 0 y sin cuotas debe exigir el cronograma.
    expect(fields).toContain("paymentSchedule");
  });

  it("no exige cronograma cuando el saldo es 0 aunque no haya cuotas", () => {
    const data = completeData({
      initialPaymentUsd: 2900,
      balanceUsd: 0,
      paymentSchedules: [],
    });
    const fields = findMissingContractFields(data).map((m) => m.field);
    expect(fields).not.toContain("paymentSchedule");
  });

  it("exige el departamento/estado/provincia (legalState) cuando falta", () => {
    const data = completeData({
      student: { ...completeData().student, legalState: null },
    });
    const fields = findMissingContractFields(data).map((m) => m.field);
    expect(fields).toContain("legalState");
    expect(isContractComplete(data)).toBe(false);
  });

  it("con datos completos no devuelve faltantes", () => {
    expect(findMissingContractFields(completeData())).toHaveLength(0);
    expect(isContractComplete(completeData())).toBe(true);
  });

  it("no bloquea por initialPaymentUsd/cronograma con pagos y cuotas legacy del estudiante", () => {
    const fields = findMissingContractFields(legacyData()).map((m) => m.field);
    expect(fields).not.toContain("initialPaymentUsd");
    expect(fields).not.toContain("balanceUsd");
    expect(fields).not.toContain("paymentSchedule");
    expect(isContractComplete(legacyData())).toBe(true);
  });
});

describe("buildContractInputFromData", () => {
  it("usa el documento y el domicilio reales del estudiante, con departamento", () => {
    const input = buildContractInputFromData(completeData());
    expect(input.clientDocument).toBe("Cédula de Ciudadanía N° 1.040.046.608");
    expect(input.clientAddress).toBe(
      "Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia",
    );
    expect(input.clientAddress).toContain("Antioquia");
    expect(input.clientName).toBe("Andrés Toro Sierra");
    expect(input.productName).toBe("Mentoría VIP 1 a 1 Dropshipping");
    expect(input.totalAmountUsd).toBe(2900);
    expect(input.balanceUsd).toBe(900);
    expect(input.installments).toHaveLength(1);
    expect(input.durationMonths).toBe(12);
  });

  it("prefiere durationMonths del estudiante aunque las fechas sugieran otra duración y lo renderiza en el contrato", () => {
    const input = buildContractInputFromData(
      completeData({
        startedAt: "2026-06-11",
        endsAt: "2027-06-11",
        student: {
          ...completeData().student,
          durationMonths: 4,
          startDate: "2026-06-11",
          // Las fechas sugieren 12 meses, pero Info muestra durationMonths = 4.
          endDate: "2027-06-11",
        },
      }),
    );
    const view = buildContractView(input);
    const blob = view.sections.flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");
    const servicios = view.sections.find((s) => s.id === "servicios")!;
    const honorarios = view.sections.find((s) => s.id === "honorarios")!;
    const clause47 = honorarios.paragraphs.find((p) => p.startsWith("4.7."))!;

    expect(input.durationMonths).toBe(4);
    expect(input.endDate).toBe("2027-06-11");
    expect(servicios.paragraphs).toContain("2.4. Acompañamiento durante 4 meses.");
    expect(clause47).toContain("cuatro (4) meses");
    expect(clause47).not.toContain("doce (12)");
    expect(blob).not.toContain("doce (12) meses a partir de la fecha de inicio");
  });

  it("calcula duración variable desde fechas reales de enrollment si durationMonths falta o no es válido", () => {
    const inputWithoutDuration = buildContractInputFromData(
      completeData({
        startedAt: "2026-06-11",
        endsAt: "2026-10-11",
        student: {
          ...completeData().student,
          durationMonths: null,
          startDate: "2026-06-11",
          // Debe preferir endsAt del enrollment sobre el endDate del estudiante.
          endDate: "2027-06-11",
        },
      }),
    );
    const inputWithInvalidDuration = buildContractInputFromData(
      completeData({
        startedAt: "2026-06-11",
        endsAt: "2026-10-11",
        student: {
          ...completeData().student,
          durationMonths: "no válido",
          startDate: "2026-06-11",
          endDate: "2027-06-11",
        },
      }),
    );

    expect(inputWithoutDuration.durationMonths).toBe(4);
    expect(inputWithoutDuration.endDate).toBe("2026-10-11");
    expect(inputWithInvalidDuration.durationMonths).toBe(4);
  });

  it("propaga templateKind BUSINESS desde contractTemplateKind", () => {
    const input = buildContractInputFromData(
      completeData({ contractTemplateKind: "BUSINESS" }),
    );
    expect(input.templateKind).toBe("BUSINESS");
  });

  it("normaliza contractTemplateKind null/undefined a TRADITIONAL", () => {
    const conNull = buildContractInputFromData(
      completeData({ contractTemplateKind: null }),
    );
    const conUndefined = buildContractInputFromData(completeData());
    expect(conNull.templateKind).toBe("TRADITIONAL");
    expect(conUndefined.templateKind).toBe("TRADITIONAL");
  });

  it("usa duración segura de 12 meses si no puede calcularla", () => {
    const input = buildContractInputFromData(
      completeData({
        startedAt: null,
        endsAt: null,
        student: {
          ...completeData().student,
          durationMonths: null,
          startDate: null,
          endDate: null,
        },
      }),
    );

    expect(input.durationMonths).toBe(12);
  });

  it("deriva total/inicial/saldo y cuotas desde los pagos y cuotas legacy del estudiante", () => {
    const input = buildContractInputFromData(legacyData());
    expect(input.totalAmountUsd).toBe(3000);
    // initialPaymentUsd se deriva de los pagos (100 + 900) porque viene null.
    expect(input.initialPaymentUsd).toBe(1000);
    // balanceUsd concilia total - pagado (3000 - 1000), no el stale 2900.
    expect(input.balanceUsd).toBe(2000);
    expect(input.installments).toHaveLength(4);
    expect(input.installments.map((i) => i.amountUsd)).toEqual([100, 900, 1000, 1000]);
  });

  it("suma TODOS los pagos aplicables aunque initialPaymentUsd explícito sea menor, y concilia el saldo", () => {
    // Estudiante con pago inicial 100 ya registrado en initialPaymentUsd, pero
    // además abonó otros 900 (dos pagos propios de la inscripción) antes de
    // generar el contrato. El balanceUsd almacenado (2900) quedó stale. El
    // contrato debe reflejar el valor pagado total (1000) y el saldo real (2000).
    const data = completeData({
      totalAmountUsd: 3000,
      initialPaymentUsd: 100,
      balanceUsd: 2900,
      payments: [
        { amount: 100, currency: "USD", isInitialPayment: true },
        { amount: 900, currency: "USD" },
      ],
      paymentSchedules: [
        { installmentNumber: 1, amountDue: 1000, currency: "USD", dueDate: "2026-09-11" },
        { installmentNumber: 2, amountDue: 1000, currency: "USD", dueDate: "2026-10-11" },
      ],
    });
    const input = buildContractInputFromData(data);
    expect(input.totalAmountUsd).toBe(3000);
    // Valor pagado = suma de TODOS los pagos (100 + 900), no el initialPaymentUsd 100.
    expect(input.initialPaymentUsd).toBe(1000);
    // Saldo conciliado total - pagado (3000 - 1000), no el stale 2900.
    expect(input.balanceUsd).toBe(2000);

    const view = buildContractView(input);
    const honorarios = view.sections.find((s) => s.id === "honorarios")!;
    const text = honorarios.paragraphs.join(" ");
    // El contrato muestra el valor pagado total y el saldo real, nunca solo 100.
    expect(text).toContain("USD $1,000.00");
    expect(text).toContain("USD $2,000.00");
    expect(text).not.toContain("USD $100.00");
  });
});

describe("namesReasonablyMatch", () => {
  it("acepta un nombre normalizado equivalente (acentos / mayúsculas)", () => {
    expect(namesReasonablyMatch("andres toro sierra", "Andrés Toro Sierra")).toBe(true);
    expect(namesReasonablyMatch("Toro Sierra, Andrés", "Andrés Toro Sierra")).toBe(true);
  });

  it("rechaza un nombre claramente distinto", () => {
    expect(namesReasonablyMatch("Pedro Gómez", "Andrés Toro Sierra")).toBe(false);
  });
});

describe("hashes de firma electrónica", () => {
  it("computeStudentSignatureHash devuelve sha256 de 64 chars y cambia con el firmante", () => {
    const input = buildContractInputFromData(completeData());
    const hashA = computeStudentSignatureHash(input, "Andrés Toro Sierra");
    const hashB = computeStudentSignatureHash(input, "Otro Firmante");
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).not.toBe(hashB);
  });

  it("computeCeoSignatureHash devuelve sha256 de 64 chars y cambia con el CEO", () => {
    const input = buildContractInputFromData(completeData());
    const studentHash = computeStudentSignatureHash(input, "Andrés Toro Sierra");
    const signedAt = new Date("2026-06-12T10:00:00.000Z");
    const hashA = computeCeoSignatureHash(studentHash, "Jose David Naicipa Jiménez", signedAt);
    const hashB = computeCeoSignatureHash(studentHash, "Otro CEO", signedAt);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashB).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).not.toBe(hashB);
  });

  it("la imagen de firma cambia el hash del estudiante (evidencia)", () => {
    const input = buildContractInputFromData(completeData());
    const sinImagen = computeStudentSignatureHash(input, "Andrés Toro Sierra");
    const conImagen = computeStudentSignatureHash(input, "Andrés Toro Sierra", TINY_PNG);
    const otraImagen = computeStudentSignatureHash(input, "Andrés Toro Sierra", TINY_JPEG);
    expect(conImagen).toMatch(/^[0-9a-f]{64}$/);
    expect(conImagen).not.toBe(sinImagen);
    expect(conImagen).not.toBe(otraImagen);
  });
});

describe("validateSignatureImage", () => {
  it("acepta data URL PNG válida", () => {
    const result = validateSignatureImage(TINY_PNG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mime).toBe("image/png");
      expect(result.bytes).toBeGreaterThan(0);
      expect(result.dataUrl).toBe(TINY_PNG);
    }
  });

  it("acepta data URL JPEG válida", () => {
    const result = validateSignatureImage(TINY_JPEG);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe("image/jpeg");
  });

  it("rechaza webp y otros formatos", () => {
    expect(validateSignatureImage("data:image/webp;base64,UklGRiQAAABXRUJQ").ok).toBe(
      false,
    );
    expect(validateSignatureImage("data:image/gif;base64,R0lGODlhAQABAAA").ok).toBe(
      false,
    );
    expect(validateSignatureImage("no es una data url").ok).toBe(false);
    expect(validateSignatureImage("").ok).toBe(false);
    expect(validateSignatureImage(null).ok).toBe(false);
  });

  it("rechaza imágenes que superan 1 MB", () => {
    const huge = `data:image/png;base64,${"A".repeat(1_400_000)}`;
    const result = validateSignatureImage(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("1 MB");
  });
});

describe("parseManualClauses", () => {
  it("recorta a maxClauses (10) y descarta el resto", () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({
      heading: `Clausula ${i + 1}`,
      paragraphs: [`Texto ${i + 1}`],
    }));
    const parsed = parseManualClauses(raw);
    expect(parsed).toHaveLength(MANUAL_CLAUSE_LIMITS.maxClauses);
    expect(parsed[0].heading).toBe("Clausula 1");
    expect(parsed[9].heading).toBe("Clausula 10");
  });

  it("descarta entradas no-objeto, sin heading o sin párrafos válidos", () => {
    const raw = [
      null,
      "string suelto",
      42,
      { heading: "", paragraphs: ["x"] },
      { heading: "   ", paragraphs: ["x"] },
      { heading: "Sin párrafos" },
      { heading: "Párrafos no-array", paragraphs: "no es array" },
      { heading: "Párrafos vacíos", paragraphs: ["", "   "] },
      { heading: "OK", paragraphs: ["válido", 123, "  otro  "] },
    ];
    const parsed = parseManualClauses(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].heading).toBe("OK");
    // Filtra el number 123 y conserva strings recortados.
    expect(parsed[0].paragraphs).toEqual(["válido", "otro"]);
  });

  it("devuelve [] para valores no-array", () => {
    expect(parseManualClauses(null)).toEqual([]);
    expect(parseManualClauses(undefined)).toEqual([]);
    expect(parseManualClauses("foo")).toEqual([]);
    expect(parseManualClauses({ heading: "x", paragraphs: ["y"] })).toEqual([]);
  });
});

describe("buildContractView con cláusulas manuales", () => {
  const baseInput = buildContractInputFromData(completeData());

  it("agrega la cláusula manual al final del cuerpo legal con id manual-N", () => {
    const manual: ManualClause = {
      heading: "Décima Cuarta. Pacto especial",
      paragraphs: ["Cláusula adicional acordada con el cliente."],
    };
    const view = buildContractView({ ...baseInput, manualClauses: [manual] });
    const last = view.sections[view.sections.length - 1];
    expect(last.id).toBe("manual-1");
    expect(last.heading).toBe(manual.heading);
    expect(last.paragraphs).toEqual(manual.paragraphs);
  });

  it("sin cláusulas manuales no añade secciones manual-*", () => {
    const view = buildContractView(baseInput);
    expect(view.sections.some((s) => s.id.startsWith("manual-"))).toBe(false);
  });
});

describe("parseManualClausesSnapshot", () => {
  it("devuelve null cuando el snapshot todavía no se tomó", () => {
    expect(parseManualClausesSnapshot(null)).toBeNull();
    expect(parseManualClausesSnapshot(undefined)).toBeNull();
  });

  it("devuelve [] cuando el JSON está corrupto", () => {
    expect(parseManualClausesSnapshot("{not json")).toEqual([]);
    expect(parseManualClausesSnapshot("")).toEqual([]);
  });

  it("normaliza el snapshot a través de parseManualClauses", () => {
    const snapshot = JSON.stringify([
      { heading: "OK", paragraphs: ["uno"] },
      { heading: "", paragraphs: ["se descarta"] },
    ]);
    expect(parseManualClausesSnapshot(snapshot)).toEqual([
      { heading: "OK", paragraphs: ["uno"] },
    ]);
  });

  it("roundtrip: serializeManualClausesSnapshot + parseManualClausesSnapshot", () => {
    const clauses: ManualClause[] = [
      { heading: "Primera adicional", paragraphs: ["uno", "dos"] },
      { heading: "Segunda adicional", paragraphs: ["tres"] },
    ];
    const snapshot = serializeManualClausesSnapshot(clauses);
    expect(parseManualClausesSnapshot(snapshot)).toEqual(clauses);
  });

  it("roundtrip de [] devuelve [] (no null)", () => {
    const snapshot = serializeManualClausesSnapshot([]);
    expect(parseManualClausesSnapshot(snapshot)).toEqual([]);
  });
});

describe("parseContractSections", () => {
  it("descarta entradas no-objeto, sin heading o sin párrafos válidos", () => {
    const raw = [
      null,
      "string suelto",
      42,
      { heading: "", paragraphs: ["x"] },
      { heading: "   ", paragraphs: ["x"] },
      { heading: "Sin párrafos" },
      { heading: "Párrafos no-array", paragraphs: "no es array" },
      { heading: "Párrafos vacíos", paragraphs: ["", "   "] },
      { id: "uno", heading: "OK", paragraphs: ["válido", 123, "  otro  "] },
    ];
    const parsed = parseContractSections(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("uno");
    expect(parsed[0].heading).toBe("OK");
    expect(parsed[0].paragraphs).toEqual(["válido", "otro"]);
  });

  it("devuelve [] para valores no-array", () => {
    expect(parseContractSections(null)).toEqual([]);
    expect(parseContractSections(undefined)).toEqual([]);
    expect(parseContractSections("foo")).toEqual([]);
    expect(parseContractSections({ heading: "x", paragraphs: ["y"] })).toEqual([]);
  });

  it("asigna un id estable cuando falta o se repite", () => {
    const parsed = parseContractSections([
      { heading: "Sin id", paragraphs: ["a"] },
      { id: "dup", heading: "Con id", paragraphs: ["b"] },
      { id: "dup", heading: "Repite id", paragraphs: ["c"] },
    ]);
    expect(parsed.map((s) => s.id)).toEqual(["section-1", "dup", "section-3"]);
  });

  it("respeta los topes de secciones, párrafos por sección y longitudes", () => {
    const rawSections = Array.from(
      { length: CONTRACT_SECTIONS_LIMITS.maxSections + 5 },
      (_, i) => ({
        heading: `Sección ${i + 1}`,
        paragraphs: Array.from(
          { length: CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection + 3 },
          (_, j) => `Párrafo ${j + 1}`,
        ),
      }),
    );
    const parsed = parseContractSections(rawSections);
    expect(parsed).toHaveLength(CONTRACT_SECTIONS_LIMITS.maxSections);
    expect(parsed[0].paragraphs).toHaveLength(
      CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection,
    );

    const longHeading = "h".repeat(CONTRACT_SECTIONS_LIMITS.maxHeadingLength + 50);
    const longParagraph = "p".repeat(CONTRACT_SECTIONS_LIMITS.maxParagraphLength + 50);
    const trimmed = parseContractSections([
      { heading: longHeading, paragraphs: [longParagraph] },
    ]);
    expect(trimmed[0].heading).toHaveLength(CONTRACT_SECTIONS_LIMITS.maxHeadingLength);
    expect(trimmed[0].paragraphs[0]).toHaveLength(
      CONTRACT_SECTIONS_LIMITS.maxParagraphLength,
    );
  });
});

describe("parseContractSectionsSnapshot", () => {
  it("devuelve null cuando el snapshot no existe", () => {
    expect(parseContractSectionsSnapshot(null)).toBeNull();
    expect(parseContractSectionsSnapshot(undefined)).toBeNull();
  });

  it("devuelve [] cuando el JSON está corrupto, sin lanzar", () => {
    expect(parseContractSectionsSnapshot("{not json")).toEqual([]);
    expect(parseContractSectionsSnapshot("")).toEqual([]);
  });

  it("roundtrip preserva ñ/tildes, viñetas '• ' y marcadores de negrita ⟦ ⟧", () => {
    const sections: ContractSection[] = [
      {
        id: "personalizada",
        heading: "Cláusula con ñ y tildes: año, mañana, José",
        paragraphs: [
          "Acompañamiento durante 4 meses con tildes: éxito, próximo.",
          "• Viñeta con ñ y acento: configuración",
          "Pago de ⟦USD $2,000.00⟧ el ⟦11 de agosto de 2026⟧.",
        ],
      },
    ];
    const snapshot = serializeContractSectionsSnapshot(sections);
    const roundtripped = parseContractSectionsSnapshot(snapshot);
    expect(roundtripped).toEqual(sections);
    // Verificaciones explícitas de que los caracteres especiales sobreviven.
    const blob = JSON.stringify(roundtripped);
    expect(blob).toContain("año");
    expect(blob).toContain("José");
    expect(blob).toContain("• Viñeta");
    expect(blob).toContain("⟦USD $2,000.00⟧");
    expect(blob).toContain("⟦11 de agosto de 2026⟧");
  });

  it("roundtrip de [] devuelve [] (no null)", () => {
    expect(parseContractSectionsSnapshot(serializeContractSectionsSnapshot([]))).toEqual(
      [],
    );
  });
});

describe("validateManualClausesInput", () => {
  it("normaliza cuerpo de textarea y viñetas antes de guardar", () => {
    const result = validateManualClausesInput([
      { heading: "  Cláusula puntual  ", body: "Primer párrafo\n- Viñeta" },
    ]);
    expect(result).toEqual({
      ok: true,
      clauses: [
        { heading: "Cláusula puntual", paragraphs: ["Primer párrafo", "• Viñeta"] },
      ],
    });
  });

  it("rechaza cuerpos vacíos para dar feedback claro a la UI", () => {
    const result = validateManualClausesInput([{ heading: "Sin cuerpo", body: "  \n" }]);
    expect(result).toEqual({
      ok: false,
      error: "Cláusula 1: agrega al menos un párrafo de cuerpo",
    });
  });
});

describe("canChangeContractTemplateKind", () => {
  const gate = (overrides?: Partial<Parameters<typeof canChangeContractTemplateKind>[0]>) => ({
    contractStatus: "DRAFT",
    contractSignedAt: null,
    contractCeoSignedAt: null,
    contractApprovedAt: null,
    ...overrides,
  });

  it("permite DRAFT, PENDING_SIGNATURE y REJECTED cuando no hay firmas", () => {
    expect(canChangeContractTemplateKind(gate({ contractStatus: "DRAFT" }))).toBe(true);
    expect(
      canChangeContractTemplateKind(gate({ contractStatus: "PENDING_SIGNATURE" })),
    ).toBe(true);
    expect(canChangeContractTemplateKind(gate({ contractStatus: "REJECTED" }))).toBe(true);
  });

  it("bloquea SIGNED, PENDING_APPROVAL y APPROVED", () => {
    expect(canChangeContractTemplateKind(gate({ contractStatus: "SIGNED" }))).toBe(false);
    expect(
      canChangeContractTemplateKind(gate({ contractStatus: "PENDING_APPROVAL" })),
    ).toBe(false);
    expect(canChangeContractTemplateKind(gate({ contractStatus: "APPROVED" }))).toBe(false);
  });

  it("bloquea si hay cualquier evidencia de firma aunque el estado lo permita", () => {
    expect(
      canChangeContractTemplateKind(
        gate({ contractStatus: "PENDING_SIGNATURE", contractSignedAt: new Date() }),
      ),
    ).toBe(false);
    expect(
      canChangeContractTemplateKind(
        gate({ contractStatus: "DRAFT", contractCeoSignedAt: "2026-06-12" }),
      ),
    ).toBe(false);
    expect(
      canChangeContractTemplateKind(
        gate({ contractStatus: "REJECTED", contractApprovedAt: new Date() }),
      ),
    ).toBe(false);
  });
});

describe("buildContractTemplateResetData", () => {
  it("fija el nuevo tipo, vuelve a DRAFT y limpia link/snapshots/firmas", () => {
    const data = buildContractTemplateResetData("BUSINESS");
    expect(data.contractTemplateKind).toBe("BUSINESS");
    expect(data.contractStatus).toBe("DRAFT");
    expect(data.contractUrl).toBeNull();
    expect(data.contractSignatureToken).toBeNull();
    expect(data.contractSignatureTokenCreatedAt).toBeNull();
    expect(data.contractManualClausesSnapshot).toBeNull();
    expect(data.contractSectionsSnapshot).toBeNull();
    expect(data.contractSignedAt).toBeNull();
    expect(data.contractStudentSignatureHash).toBeNull();
    expect(data.contractStudentSignatureImage).toBeNull();
    expect(data.contractCeoSignedAt).toBeNull();
    expect(data.contractCeoSignatureHash).toBeNull();
    expect(data.contractApprovedAt).toBeNull();
    expect(data.contractRejectedAt).toBeNull();
  });

  it("conserva el tipo TRADITIONAL cuando se cambia hacia él", () => {
    expect(buildContractTemplateResetData("TRADITIONAL").contractTemplateKind).toBe(
      "TRADITIONAL",
    );
  });
});

describe("buildContractSignersSummary", () => {
  const student = (
    members?: ContractSignersInputMember[],
    legalName: string | null = "Andrés Toro Sierra",
  ) => ({
    student: {
      fullName: "Andrés Toro Sierra",
      legalName,
      ...(members ? { members } : {}),
    },
  });

  type ContractSignersInputMember = {
    id: string;
    fullName: string;
    isContractSigner: boolean;
    contractSignedAt: Date | string | null;
  };

  it("flujo legacy: sin integrantes marcados, el único firmante es el titular", () => {
    const summary = buildContractSignersSummary(student());
    expect(summary.usesMembers).toBe(false);
    expect(summary.signers).toHaveLength(1);
    expect(summary.signers[0].id).toBe(CONTRACT_HOLDER_SIGNER_ID);
    expect(summary.signers[0].isPrimary).toBe(true);
    expect(summary.signers[0].name).toBe("Andrés Toro Sierra");
    expect(summary.allSigned).toBe(false);
  });

  it("titular firma cuando la inscripción tiene contractSignedAt", () => {
    const sin = buildContractSignersSummary(student());
    const con = buildContractSignersSummary({
      ...student(),
      contractSignedAt: new Date("2026-06-24T10:00:00.000Z"),
    });
    expect(sin.signers[0].signed).toBe(false);
    expect(con.signers[0].signed).toBe(true);
    expect(con.allSigned).toBe(true);
  });

  it("usa el nombre legal del titular cuando existe y cae al fullName si falta", () => {
    const conLegal = buildContractSignersSummary(student(undefined, "  Nombre Legal  "));
    const sinLegal = buildContractSignersSummary(student(undefined, null));
    expect(conLegal.signers[0].name).toBe("Nombre Legal");
    expect(sinLegal.signers[0].name).toBe("Andrés Toro Sierra");
  });

  it("firmantes requeridos = titular SIEMPRE + cada integrante marcado", () => {
    const summary = buildContractSignersSummary(
      student([
        { id: "m1", fullName: "Integrante Uno", isContractSigner: true, contractSignedAt: null },
        { id: "m2", fullName: "Integrante Dos", isContractSigner: false, contractSignedAt: null },
        { id: "m3", fullName: "Integrante Tres", isContractSigner: true, contractSignedAt: null },
      ]),
    );
    expect(summary.usesMembers).toBe(true);
    expect(summary.signers.map((s) => s.id)).toEqual([
      CONTRACT_HOLDER_SIGNER_ID,
      "m1",
      "m3",
    ]);
    expect(summary.total).toBe(3);
    expect(summary.pending.map((s) => s.id)).toEqual([
      CONTRACT_HOLDER_SIGNER_ID,
      "m1",
      "m3",
    ]);
  });

  it("computa progreso: cuenta titular + integrantes firmados", () => {
    const summary = buildContractSignersSummary({
      ...student([
        {
          id: "m1",
          fullName: "Integrante Uno",
          isContractSigner: true,
          contractSignedAt: new Date("2026-06-24T11:00:00.000Z"),
        },
        { id: "m2", fullName: "Integrante Dos", isContractSigner: true, contractSignedAt: null },
      ]),
      contractSignedAt: new Date("2026-06-24T10:00:00.000Z"),
    });
    expect(summary.signedCount).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.allSigned).toBe(false);
    expect(summary.pending.map((s) => s.id)).toEqual(["m2"]);
  });

  it("allSigned solo cuando titular y todos los integrantes marcados firmaron", () => {
    const members: ContractSignersInputMember[] = [
      {
        id: "m1",
        fullName: "Integrante Uno",
        isContractSigner: true,
        contractSignedAt: new Date("2026-06-24T11:00:00.000Z"),
      },
    ];
    const titularPendiente = buildContractSignersSummary(student(members));
    const todoFirmado = buildContractSignersSummary({
      ...student(members),
      contractSignedAt: new Date("2026-06-24T10:00:00.000Z"),
    });
    expect(titularPendiente.allSigned).toBe(false);
    expect(titularPendiente.pending.map((s) => s.id)).toEqual([
      CONTRACT_HOLDER_SIGNER_ID,
    ]);
    expect(todoFirmado.allSigned).toBe(true);
  });
});

describe("productos-tab no expone el contrato de prueba", () => {
  const productosTabSource = () =>
    readFileSync(
      resolve(appRoot, "src/app/operaciones/estudiantes/[id]/productos-tab.tsx"),
      "utf8",
    );

  it("no contiene el copy del contrato de prueba", () => {
    const source = productosTabSource();
    expect(source).not.toContain("Crear contrato de prueba");
    expect(source).not.toContain("contrato de prueba");
    expect(source).not.toContain("Contrato de prueba");
  });
});
