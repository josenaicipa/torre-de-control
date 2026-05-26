import { describe, expect, it } from "vitest";
import {
  parseBool,
  parseCloserName,
  parseDateFlexible,
  parseMoney,
  parseMonths,
  parseRowFromArray,
  parseStatus,
  parseStudentNames,
} from "./legacy-cartera-parser";

describe("parseDateFlexible", () => {
  it("parses dd/mm/yy", () => {
    expect(parseDateFlexible("08/08/24")?.toISOString().slice(0, 10)).toBe("2024-08-08");
  });

  it("parses dd/mm/yyyy", () => {
    expect(parseDateFlexible("02/09/2024")?.toISOString().slice(0, 10)).toBe("2024-09-02");
  });

  it("returns null for empty or impossible dates", () => {
    expect(parseDateFlexible("")).toBeNull();
    expect(parseDateFlexible(null)).toBeNull();
    expect(parseDateFlexible("31/02/2025")).toBeNull();
  });

  it("handles 31/01/26", () => {
    expect(parseDateFlexible("31/01/26")?.toISOString().slice(0, 10)).toBe("2026-01-31");
  });
});

describe("parseMoney", () => {
  it("parses currency-formatted amounts", () => {
    expect(parseMoney("$1,250.00")).toBe(1250);
    expect(parseMoney("720.00")).toBe(720);
  });

  it("returns 0 on empty", () => {
    expect(parseMoney("")).toBe(0);
  });
});

describe("parseBool", () => {
  it("only treats TRUE as received", () => {
    expect(parseBool("TRUE")).toBe(true);
    expect(parseBool("FALSE")).toBe(false);
    expect(parseBool("")).toBe(false);
  });
});

describe("parseMonths", () => {
  it("extracts the first stated duration", () => {
    expect(parseMonths("9 meses")).toBe(9);
    expect(parseMonths("6 meses o 1 año depende")).toBe(6);
    expect(parseMonths("")).toBeNull();
  });
});

describe("parseStudentNames", () => {
  it("parses a single student", () => {
    const result = parseStudentNames("Juan Perez", "juan@x.com", "300");
    expect(result.head).toEqual({ fullName: "Juan Perez", email: "juan@x.com", phone: "300" });
    expect(result.members).toHaveLength(0);
  });

  it("splits a couple separated by hyphen", () => {
    const result = parseStudentNames(
      "Kevin - Juliana",
      "kevin@a.com - juliana@b.com",
      "300 - 311",
    );
    expect(result.head.fullName).toBe("Kevin");
    expect(result.members[0]).toMatchObject({ fullName: "Juliana", email: "juliana@b.com" });
  });

  it("splits a couple separated by y with multiline contacts", () => {
    const result = parseStudentNames(
      "Lourdes y Guillermo",
      "lourdes@a.com\nguillermo@b.com",
      "300\n311",
    );
    expect(result.head.fullName).toBe("Lourdes");
    expect(result.members).toHaveLength(1);
  });
});

describe("parseCloserName", () => {
  it("uses the first closer listed", () => {
    expect(parseCloserName("Daryi/Valen/Karo")).toBe("Daryi");
    expect(parseCloserName("Juan Diego/Valen/Luisa")).toBe("Juan Diego");
  });
});

describe("parseStatus", () => {
  it("maps revoked access with a balance to ACCESS_REVOKED", () => {
    expect(parseStatus("SIN ACCESOS", null, 500, null)).toBe("ACCESS_REVOKED");
  });

  it("maps removed access without balance to DROPPED", () => {
    expect(parseStatus("RETIRADO SIN ACCESOS", null, 0, null)).toBe("DROPPED");
  });

  it("maps frozen mentoring to PAUSED", () => {
    expect(parseStatus("MENTORIA FRIZZADA POR 1 MES", null, 0, null)).toBe("PAUSED");
  });

  it("leaves ordinary pending students ACTIVE", () => {
    expect(parseStatus("", "", 1000, null)).toBe("ACTIVE");
  });
});

describe("parseRowFromArray", () => {
  it("parses a standard row and adds the pending installment", () => {
    const row = [
      "Juan Perez", "300 1234", "juan@x.com",
      "Daryi/Valen", "10/03/25", "$1,500.00", "Stripe", "TRUE",
      "", "", "", "FALSE", "", "", "", "FALSE",
      "$1,500.00", "9 meses", "12/03/25", "12/12/25",
      "Mentoria dropshipping", "",
    ];
    const parsed = parseRowFromArray(row, 1);
    expect(parsed.head.fullName).toBe("Juan Perez");
    expect(parsed.closerNameRaw).toBe("Daryi");
    expect(parsed.durationMonths).toBe(9);
    expect(parsed.durationAssumed).toBe(false);
    expect(parsed.installments).toHaveLength(2);
    expect(parsed.installments[0].amountPaid).toBe(1500);
    expect(parsed.pendingAmount).toBe(1500);
    expect(parsed.status).toBe("ACTIVE");
  });

  it("parses a pair whose access was removed", () => {
    const row = [
      "Lourdes y Guillermo", "300\n311", "l@a.com\ng@b.com",
      "Cami/Karo", "08/08/24", "$2,000.00", "Wallet", "FALSE",
      "", "", "", "FALSE", "", "", "", "FALSE",
      "$0.00", "", "", "", "", "SIN ACCESOS",
    ];
    const parsed = parseRowFromArray(row, 5);
    expect(parsed.head.fullName).toBe("Lourdes");
    expect(parsed.members[0].fullName).toBe("Guillermo");
    expect(parsed.status).toBe("DROPPED");
  });
});
