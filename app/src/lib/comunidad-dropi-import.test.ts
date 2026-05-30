import { describe, expect, it } from "vitest";
import { previewCsv } from "./comunidad-dropi-import";

describe("previewCsv country defaulting", () => {
  it("defaults to CO when the file has no country column", () => {
    const csv = [
      "nombre,correo,telefono,ordenes ingresadas",
      "Ana López,ana@example.com,+573001234567,10",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.rowsValid).toBe(1);
    expect(result.parsedRows[0].country).toBe("CO");
    expect(result.detectedColumns.country).toBeUndefined();
  });

  it("defaults to CO when the country cell is blank", () => {
    const csv = [
      "nombre,correo,pais,ordenes ingresadas",
      "Ana López,ana@example.com,,10",
      "Bruno Pérez,bruno@example.com,   ,5",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.rowsValid).toBe(2);
    expect(result.parsedRows[0].country).toBe("CO");
    expect(result.parsedRows[1].country).toBe("CO");
  });

  it("respects an explicit country value from the file", () => {
    const csv = [
      "nombre,correo,pais,ordenes ingresadas",
      "Ana López,ana@example.com,MX,10",
      "Bruno Pérez,bruno@example.com,Perú,5",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.parsedRows[0].country).toBe("MX");
    expect(result.parsedRows[1].country).toBe("PE");
  });
});
