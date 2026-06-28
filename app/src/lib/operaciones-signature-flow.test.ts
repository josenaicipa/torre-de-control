import { describe, expect, it } from "vitest";
import {
  buildContractSignatureToken,
  buildSignedContractDriveFilename,
  normalizeEmail,
  normalizePhone,
  pickStudentMatch,
  slugifyNameForToken,
} from "./operaciones-signature-flow";

describe("buildSignedContractDriveFilename", () => {
  it("uses the exact blueprint format", () => {
    expect(buildSignedContractDriveFilename("Juan Perez", 4)).toBe(
      "Contrato - Juan Perez - Nivel 4.pdf",
    );
  });

  it("keeps accents and ñ untouched", () => {
    expect(buildSignedContractDriveFilename("José Muñoz", 2)).toBe(
      "Contrato - José Muñoz - Nivel 2.pdf",
    );
  });

  it("sanitizes path separators and collapses whitespace", () => {
    expect(buildSignedContractDriveFilename("  Ana/Maria\\Lopez  ", 1)).toBe(
      "Contrato - Ana Maria Lopez - Nivel 1.pdf",
    );
  });

  it("falls back to a placeholder name when empty", () => {
    expect(buildSignedContractDriveFilename("   ", 3)).toBe(
      "Contrato - Estudiante - Nivel 3.pdf",
    );
  });

  it("falls back to Nivel X when the level is missing or not finite", () => {
    expect(buildSignedContractDriveFilename("Juan Perez")).toBe(
      "Contrato - Juan Perez - Nivel X.pdf",
    );
    expect(buildSignedContractDriveFilename("Juan Perez", null)).toBe(
      "Contrato - Juan Perez - Nivel X.pdf",
    );
    expect(buildSignedContractDriveFilename("Juan Perez", Number.NaN)).toBe(
      "Contrato - Juan Perez - Nivel X.pdf",
    );
  });
});

describe("slugifyNameForToken", () => {
  it("strips accents/ñ, lowercases and hyphenates", () => {
    expect(slugifyNameForToken("José Muñoz")).toBe("jose-munoz");
  });

  it("collapses non-alphanumerics and trims hyphens", () => {
    expect(slugifyNameForToken("  Ana/Maria  Lopez  ")).toBe("ana-maria-lopez");
  });

  it("falls back to estudiante when nothing usable remains", () => {
    expect(slugifyNameForToken("   ")).toBe("estudiante");
    expect(slugifyNameForToken(null)).toBe("estudiante");
    expect(slugifyNameForToken(undefined)).toBe("estudiante");
  });
});

describe("buildContractSignatureToken", () => {
  it("joins the name slug with the random suffix", () => {
    expect(buildContractSignatureToken("Juan Perez", "abc123")).toBe(
      "juan-perez-abc123",
    );
  });

  it("uses the estudiante fallback when the name is empty", () => {
    expect(buildContractSignatureToken("   ", "abc123")).toBe(
      "estudiante-abc123",
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
