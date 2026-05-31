import { describe, expect, it } from "vitest";
import {
  buildHref,
  buildSearchString,
  parsePeriod,
  periodKey,
} from "./period";

describe("parsePeriod", () => {
  it("devuelve {} si el valor es nulo o vacío", () => {
    expect(parsePeriod(undefined)).toEqual({});
    expect(parsePeriod("")).toEqual({});
  });

  it("acepta YYYY-M y YYYY-MM", () => {
    expect(parsePeriod("2026-5")).toEqual({ year: 2026, month: 5 });
    expect(parsePeriod("2026-05")).toEqual({ year: 2026, month: 5 });
  });

  it("toma el primer elemento si llega como array (Next searchParams)", () => {
    expect(parsePeriod(["2025-12", "2024-01"])).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("rechaza valores no numéricos", () => {
    expect(parsePeriod("abc")).toEqual({});
    expect(parsePeriod("2026-abc")).toEqual({});
    expect(parsePeriod("2026")).toEqual({});
  });
});

describe("periodKey", () => {
  it("formatea sin padding cero, igual que el resto del módulo", () => {
    expect(periodKey({ year: 2026, month: 5 })).toBe("2026-5");
    expect(periodKey({ year: 2026, month: 12 })).toBe("2026-12");
  });
});

describe("buildSearchString", () => {
  it("omite valores nulos, undefined y cadenas vacías", () => {
    expect(
      buildSearchString({
        a: "1",
        b: null,
        c: undefined,
        d: "",
      }),
    ).toBe("?a=1");
  });

  it("devuelve cadena vacía si no quedan parámetros", () => {
    expect(buildSearchString({ a: null, b: "" })).toBe("");
  });

  it("codifica valores especiales", () => {
    expect(buildSearchString({ q: "hola mundo" })).toBe("?q=hola+mundo");
  });
});

describe("buildHref", () => {
  it("compone basePath + querystring filtrado", () => {
    expect(
      buildHref("/comunidad-dropi/rankings", {
        period: "2026-5",
        sort: null,
        segment: "STAR",
      }),
    ).toBe("/comunidad-dropi/rankings?period=2026-5&segment=STAR");
  });

  it("devuelve solo el path si no hay parámetros activos", () => {
    expect(
      buildHref("/comunidad-dropi/segmentos", { period: null }),
    ).toBe("/comunidad-dropi/segmentos");
  });
});
