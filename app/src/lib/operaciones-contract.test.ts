import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContractInputFromData,
  computeCeoSignatureHash,
  computeStudentSignatureHash,
  findMissingContractFields,
  isContractComplete,
  namesReasonablyMatch,
  validateSignatureImage,
  type ContractDataShape,
} from "./operaciones-contract";

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
