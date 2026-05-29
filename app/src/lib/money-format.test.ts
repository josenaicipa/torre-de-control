import { describe, expect, it } from "vitest";
import { formatMoneyDisplay, parseMoneyInput } from "./money-format";

describe("parseMoneyInput", () => {
  it("devuelve cadena vacía para entradas vacías o sin dígitos", () => {
    expect(parseMoneyInput("")).toBe("");
    expect(parseMoneyInput(null)).toBe("");
    expect(parseMoneyInput(undefined)).toBe("");
    expect(parseMoneyInput("abc")).toBe("");
    expect(parseMoneyInput("$ ")).toBe("");
  });

  it("conserva números enteros simples", () => {
    expect(parseMoneyInput("5000000")).toBe("5000000");
  });

  it("normaliza valores con puntos como separador de miles", () => {
    expect(parseMoneyInput("5.000.000")).toBe("5000000");
    expect(parseMoneyInput("1.000")).toBe("1000");
  });

  it("normaliza valores con comas como separador de miles", () => {
    expect(parseMoneyInput("5,000,000")).toBe("5000000");
  });

  it("acepta coma decimal estilo colombiano", () => {
    expect(parseMoneyInput("5.000.000,50")).toBe("5000000.50");
    expect(parseMoneyInput("10,5")).toBe("10.5");
  });

  it("acepta punto decimal estilo en_US", () => {
    expect(parseMoneyInput("5,000,000.50")).toBe("5000000.50");
    expect(parseMoneyInput("10.50")).toBe("10.50");
  });

  it("ignora símbolos y espacios al inicio o intercalados", () => {
    expect(parseMoneyInput("$ 5.000.000")).toBe("5000000");
    expect(parseMoneyInput("USD 1,234.56")).toBe("1234.56");
    expect(parseMoneyInput("  10 000  ")).toBe("10000");
  });

  it("trata un solo separador con 3+ dígitos detrás como miles", () => {
    expect(parseMoneyInput("5.000")).toBe("5000");
    expect(parseMoneyInput("1,000")).toBe("1000");
  });

  it("trata un solo separador con 1-2 dígitos detrás como decimal", () => {
    expect(parseMoneyInput("5.5")).toBe("5.5");
    expect(parseMoneyInput("5,5")).toBe("5.5");
    expect(parseMoneyInput("5.50")).toBe("5.50");
  });

  it("descarta ceros a la izquierda en la parte entera", () => {
    expect(parseMoneyInput("0005000")).toBe("5000");
    expect(parseMoneyInput("00")).toBe("0");
  });

  it("permite el cero", () => {
    expect(parseMoneyInput("0")).toBe("0");
    expect(parseMoneyInput("0,5")).toBe("0.5");
  });
});

describe("formatMoneyDisplay", () => {
  it("devuelve cadena vacía cuando no hay valor", () => {
    expect(formatMoneyDisplay("")).toBe("");
    expect(formatMoneyDisplay(null)).toBe("");
    expect(formatMoneyDisplay(undefined)).toBe("");
  });

  it("agrega puntos como separador de miles", () => {
    expect(formatMoneyDisplay("5000000")).toBe("5.000.000");
    expect(formatMoneyDisplay("1000")).toBe("1.000");
    expect(formatMoneyDisplay("100")).toBe("100");
  });

  it("usa coma como separador decimal", () => {
    expect(formatMoneyDisplay("5000000.5")).toBe("5.000.000,5");
    expect(formatMoneyDisplay("1234.56")).toBe("1.234,56");
    expect(formatMoneyDisplay("0.5")).toBe("0,5");
  });

  it("conserva la coma final cuando el usuario está tipeando decimales", () => {
    expect(formatMoneyDisplay("5000000.")).toBe("5.000.000,");
    expect(formatMoneyDisplay("5.")).toBe("5,");
  });

  it("redondea por composición — round-trip parse + format", () => {
    expect(formatMoneyDisplay(parseMoneyInput("$ 5.000.000"))).toBe("5.000.000");
    expect(formatMoneyDisplay(parseMoneyInput("5,000,000.50"))).toBe(
      "5.000.000,50",
    );
  });
});
