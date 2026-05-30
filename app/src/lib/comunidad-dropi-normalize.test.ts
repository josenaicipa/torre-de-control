import { describe, expect, it } from "vitest";
import {
  detectReportPeriodFromName,
  normalizeCountry,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  safeRate,
} from "./comunidad-dropi-normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.com  ")).toBe("foo@bar.com");
  });
  it("rejects strings without @", () => {
    expect(normalizeEmail("noatsign")).toBeNull();
  });
  it("rejects empty / non-string", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(123 as unknown)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("keeps digits and a single leading plus", () => {
    expect(normalizePhone("+57 300 123 4567")).toBe("+573001234567");
    expect(normalizePhone("57-300-123-4567")).toBe("573001234567");
  });
  it("removes parentheses, spaces, dots", () => {
    expect(normalizePhone("(300) 123.4567")).toBe("3001234567");
  });
  it("rejects empty values", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
  it("collapses duplicate plus signs", () => {
    expect(normalizePhone("++57300")).toBe("+57300");
  });
});

describe("normalizeCountry", () => {
  it("maps Spanish names to ISO-2", () => {
    expect(normalizeCountry("Colombia")).toBe("CO");
    expect(normalizeCountry("MÉXICO")).toBe("MX");
    expect(normalizeCountry("perú")).toBe("PE");
  });
  it("falls back to uppercase trimmed code for unknown", () => {
    expect(normalizeCountry("xx")).toBe("XX");
  });
  it("rejects empty", () => {
    expect(normalizeCountry("")).toBeNull();
    expect(normalizeCountry(null)).toBeNull();
  });
});

describe("normalizeFullName", () => {
  it("collapses internal whitespace", () => {
    expect(normalizeFullName("  Ana   Maria  Pérez  ")).toBe("Ana Maria Pérez");
  });
  it("rejects empty", () => {
    expect(normalizeFullName("   ")).toBeNull();
    expect(normalizeFullName(null)).toBeNull();
  });
});

describe("detectReportPeriodFromName", () => {
  it("detects weekly with two full dates", () => {
    const r = detectReportPeriodFromName(
      "comunidad-dropi-2026-05-01_2026-05-07.xlsx",
    );
    expect(r?.reportType).toBe("WEEKLY");
    expect(r?.periodStart?.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(r?.periodEnd?.toISOString().slice(0, 10)).toBe("2026-05-07");
  });

  it("detects weekly same-month range with 'al'", () => {
    const r = detectReportPeriodFromName("dropi 2026-05-06 al 12.xlsx");
    expect(r?.reportType).toBe("WEEKLY");
    expect(r?.periodStart?.toISOString().slice(0, 10)).toBe("2026-05-06");
    expect(r?.periodEnd?.toISOString().slice(0, 10)).toBe("2026-05-12");
  });
  it("falls back to monthly when only year-month present", () => {
    const r = detectReportPeriodFromName("dropi 2026-05.xlsx");
    expect(r?.reportType).toBe("MONTHLY");
    expect(r?.year).toBe(2026);
    expect(r?.month).toBe(5);
  });
  it("uses keyword hints when no dates", () => {
    expect(detectReportPeriodFromName("reporte mensual.xlsx")?.reportType).toBe(
      "MONTHLY",
    );
    expect(detectReportPeriodFromName("reporte semanal.xlsx")?.reportType).toBe(
      "WEEKLY",
    );
  });
  it("returns null when nothing matches", () => {
    expect(detectReportPeriodFromName("dropi.xlsx")).toBeNull();
  });

  it("detects monthly from Spanish month name plus a YY-MM-DD stamp", () => {
    const r = detectReportPeriodFromName(
      "26-04-06 UNLOCKED 1 - 5 ABRIL (1).xlsx",
    );
    expect(r?.reportType).toBe("MONTHLY");
    expect(r?.year).toBe(2026);
    expect(r?.month).toBe(4);
    expect(r?.periodStart).toBeUndefined();
    expect(r?.periodEnd).toBeUndefined();
  });

  it("detects monthly from a Spanish month with a partial day range", () => {
    expect(detectReportPeriodFromName("1-5 abril.xlsx")).toEqual({
      reportType: "MONTHLY",
      month: 4,
    });
    expect(detectReportPeriodFromName("1 a 5 abril.xlsx")).toEqual({
      reportType: "MONTHLY",
      month: 4,
    });
  });

  it("prefers the Spanish month over the YY-MM prefix when both disagree", () => {
    // The YY prefix is the upload date stamp; the period is the named month.
    const r = detectReportPeriodFromName("26-05-10 reporte abril 2026.xlsx");
    expect(r?.reportType).toBe("MONTHLY");
    expect(r?.month).toBe(4);
    expect(r?.year).toBe(2026);
  });

  it("keeps weekly when there is a real ISO range alongside a Spanish month", () => {
    const r = detectReportPeriodFromName(
      "2026-04-01_2026-04-07 abril.xlsx",
    );
    expect(r?.reportType).toBe("WEEKLY");
    expect(r?.periodStart?.toISOString().slice(0, 10)).toBe("2026-04-01");
    expect(r?.periodEnd?.toISOString().slice(0, 10)).toBe("2026-04-07");
  });

  it("keeps weekly when the same-month range pattern is present with a Spanish month", () => {
    const r = detectReportPeriodFromName("2026-04-06 al 12 abril.xlsx");
    expect(r?.reportType).toBe("WEEKLY");
    expect(r?.periodStart?.toISOString().slice(0, 10)).toBe("2026-04-06");
    expect(r?.periodEnd?.toISOString().slice(0, 10)).toBe("2026-04-12");
  });
});

describe("safeRate", () => {
  it("returns 0 on zero or negative denominator", () => {
    expect(safeRate(10, 0)).toBe(0);
    expect(safeRate(10, -3)).toBe(0);
  });
  it("rounds to two decimals", () => {
    expect(safeRate(1, 3)).toBeCloseTo(33.33, 2);
  });
  it("caps obscene values", () => {
    expect(safeRate(99999, 1)).toBe(1000);
  });
});
