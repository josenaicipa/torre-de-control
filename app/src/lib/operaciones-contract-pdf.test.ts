import { describe, expect, it } from "vitest";
import { generateSignedContractPdf } from "./operaciones-contract-pdf";
import type { ContractInput } from "./operaciones-contract-template";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const input: ContractInput = {
  clientName: "Andrés Toro Sierra",
  clientEmail: "andres@example.com",
  clientDocument: "Cédula de Ciudadanía N° 1.040.046.608",
  clientAddress: "Carrera 27 # 7b - 145, Medellín, Antioquia, Colombia",
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

function baseEvidence(image: string | null) {
  return {
    studentSignerName: "Andrés Toro Sierra",
    studentSignedAt: new Date("2026-06-12T10:00:00.000Z"),
    studentSignedIp: "190.0.0.1",
    studentSignatureHash: "a".repeat(64),
    studentSignatureImage: image,
    ceoSignerName: "Jose David Naicipa Jiménez",
    ceoSignedAt: new Date("2026-06-12T12:00:00.000Z"),
    ceoSignatureHash: "b".repeat(64),
    ceoSignatureImage: image,
    templateVersion: "2026-06-unlocked-v1",
  };
}

describe("generateSignedContractPdf", () => {
  it("genera un PDF válido incrustando la imagen de firma PNG", async () => {
    const pdf = await generateSignedContractPdf({
      input,
      evidence: baseEvidence(TINY_PNG),
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("no rompe cuando la imagen de firma es inválida o falta", async () => {
    const sinImagen = await generateSignedContractPdf({
      input,
      evidence: baseEvidence(null),
    });
    expect(sinImagen.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const imagenInvalida = await generateSignedContractPdf({
      input,
      evidence: baseEvidence("data:image/webp;base64,UklGRiQAAABXRUJQ"),
    });
    expect(imagenInvalida.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("no explota con caracteres Unicode españoles (ñ, tildes, «», °, —, viñetas)", async () => {
    const unicodeInput: ContractInput = {
      ...input,
      clientName: "Begoña Muñoz Peñaranda Ñández",
      clientDocument: "Cédula N° 1.234.567 — categoría «única»",
      clientAddress: "Calle Ñuñoa 123°, Bogotá, Cundinamarca",
      productName: "Mentoría «Unlocked» — Dropshipping ñ áéíóú",
    };
    const pdf = await generateSignedContractPdf({
      input: unicodeInput,
      evidence: baseEvidence(TINY_PNG),
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
