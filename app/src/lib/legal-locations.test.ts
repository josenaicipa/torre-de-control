import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  DOCUMENT_TYPES,
  SUBDIVISIONS_BY_COUNTRY,
  subdivisionsForCountry,
} from "./legal-locations";

describe("DOCUMENT_TYPES", () => {
  it("incluye los tipos obligatorios de Colombia, DNI e INE", () => {
    const values = DOCUMENT_TYPES.map((d) => d.value);
    expect(values).toContain("Cédula de Ciudadanía");
    expect(values).toContain("DNI");
    expect(values).toContain("INE");
  });

  it("cada opción tiene value y label no vacíos", () => {
    for (const opt of DOCUMENT_TYPES) {
      expect(opt.value.length).toBeGreaterThan(0);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe("COUNTRIES", () => {
  it("incluye los mercados principales", () => {
    expect(COUNTRIES).toContain("Colombia");
    expect(COUNTRIES).toContain("México");
    expect(COUNTRIES).toContain("Estados Unidos");
    expect(COUNTRIES).toContain("Perú");
  });

  it("no tiene países duplicados", () => {
    expect(new Set(COUNTRIES).size).toBe(COUNTRIES.length);
  });
});

describe("subdivisionsForCountry", () => {
  it("devuelve el catálogo de departamentos para Colombia", () => {
    const subs = subdivisionsForCountry("Colombia");
    expect(subs).toContain("Antioquia");
    expect(subs).toContain("Cundinamarca");
    expect(subs.length).toBe(SUBDIVISIONS_BY_COUNTRY.Colombia.length);
  });

  it("devuelve estados para México y Estados Unidos", () => {
    expect(subdivisionsForCountry("México")).toContain("Jalisco");
    expect(subdivisionsForCountry("Estados Unidos")).toContain("Florida");
  });

  it("devuelve lista vacía para un país sin catálogo o valor nulo", () => {
    expect(subdivisionsForCountry("Francia")).toEqual([]);
    expect(subdivisionsForCountry(null)).toEqual([]);
    expect(subdivisionsForCountry(undefined)).toEqual([]);
    expect(subdivisionsForCountry("")).toEqual([]);
  });
});
