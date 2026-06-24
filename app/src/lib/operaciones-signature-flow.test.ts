import { describe, expect, it } from "vitest";
import {
  buildSignedContractDriveFilename,
  normalizeEmail,
  normalizePhone,
  pickStudentMatch,
} from "./operaciones-signature-flow";

describe("buildSignedContractDriveFilename", () => {
  it("uses the exact blueprint format", () => {
    expect(buildSignedContractDriveFilename("Juan Perez", 4)).toBe(
      "Contrato firmado - Juan Perez - Nivel 4.pdf",
    );
  });

  it("keeps accents and ñ untouched", () => {
    expect(buildSignedContractDriveFilename("José Muñoz", 5)).toBe(
      "Contrato firmado - José Muñoz - Nivel 5.pdf",
    );
  });

  it("sanitizes path separators and collapses whitespace", () => {
    expect(buildSignedContractDriveFilename("  Ana/Maria\\Lopez  ", 3)).toBe(
      "Contrato firmado - Ana Maria Lopez - Nivel 3.pdf",
    );
  });

  it("falls back to a placeholder name when empty", () => {
    expect(buildSignedContractDriveFilename("   ", 3)).toBe(
      "Contrato firmado - Estudiante - Nivel 3.pdf",
    );
  });
});

describe("normalizeEmail / normalizePhone", () => {
  it("lowercases and trims email, null for empty", () => {
    expect(normalizeEmail("  Juan@Email.com ")).toBe("juan@email.com");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("keeps last 10 digits so +57 prefix matches the bare number", () => {
    expect(normalizePhone("+57 300 123 4567")).toBe("3001234567");
    expect(normalizePhone("3001234567")).toBe("3001234567");
  });

  it("returns null for too-short or empty phones", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("pickStudentMatch", () => {
  const candidates = [
    { id: "s1", ghlContactId: "ghl-1", email: "uno@email.com", phone: "+57 3001112222" },
    { id: "s2", ghlContactId: "ghl-2", email: "dos@email.com", phone: "3003334444" },
  ];

  it("matches by ghlContactId first", () => {
    expect(
      pickStudentMatch({ ghlContactId: "ghl-2", studentEmail: "uno@email.com" }, candidates),
    ).toBe("s2");
  });

  it("falls back to normalized email when no ghl match", () => {
    expect(
      pickStudentMatch({ ghlContactId: "ghl-x", studentEmail: "UNO@email.com" }, candidates),
    ).toBe("s1");
  });

  it("falls back to normalized phone last", () => {
    expect(
      pickStudentMatch({ studentPhone: "+1 300 333 4444" }, candidates),
    ).toBe("s2");
  });

  it("returns null when nothing matches", () => {
    expect(
      pickStudentMatch({ studentEmail: "nadie@email.com", studentPhone: "9998887777" }, candidates),
    ).toBeNull();
  });
});
