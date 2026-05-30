import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseXlsxBuffer, previewXlsx } from "./comunidad-dropi-xlsx";

async function buildWorkbookBuffer(
  build: (workbook: ExcelJS.Workbook) => void,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const ab = await workbook.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

describe("parseXlsxBuffer", () => {
  it("picks the USUARIOS sheet when present and skips a leading group label row", async () => {
    const buffer = await buildWorkbookBuffer((wb) => {
      const extra = wb.addWorksheet("Resumen");
      extra.addRow(["nada"]);
      const sheet = wb.addWorksheet("USUARIOS");
      sheet.addRow(["abril"]);
      sheet.addRow([
        "NOMBRE",
        "CORREO",
        "TELEFONO",
        "PAIS",
        "DROPI ID",
        "ORDENES INGRESADAS",
        "ORDENES MOVILIZADAS",
        "ORDENES ENTREGADAS",
        "ORDENES DEVUELTAS",
      ]);
      sheet.addRow([
        "Ana López",
        "ana@example.com",
        "+573001234567",
        "CO",
        "U1",
        10,
        8,
        7,
        1,
      ]);
    });
    const result = await parseXlsxBuffer(buffer);
    expect(result.sheetName).toBe("USUARIOS");
    expect(result.matrix[0]).toContain("NOMBRE");
    expect(result.matrix.length).toBe(2);
  });

  it("merges 2-row headers when the second row completes the alias coverage", async () => {
    const buffer = await buildWorkbookBuffer((wb) => {
      const sheet = wb.addWorksheet("Export");
      sheet.addRow([
        "",
        "CORREO",
        "TELEFONO",
        "PAIS",
        "DROPI ID",
        "ORDENES INGRESADAS",
        "ORDENES MOVILIZADAS",
        "ORDENES ENTREGADAS",
        "ORDENES DEVUELTAS",
      ]);
      sheet.addRow(["NOMBRE", "", "", "", "", "", "", "", ""]);
      sheet.addRow([
        "Total",
        "Total",
        "",
        "",
        "",
        100,
        80,
        70,
        10,
      ]);
      sheet.addRow([
        "Ana",
        "ana@x.com",
        "+57300",
        "CO",
        "U1",
        5,
        4,
        3,
        1,
      ]);
    });
    const result = await parseXlsxBuffer(buffer);
    expect(result.matrix[0][0].toLowerCase()).toContain("nombre");
    const dataRows = result.matrix.slice(1);
    expect(dataRows.some((r) => r[0] === "Ana")).toBe(true);
    expect(dataRows.some((r) => (r[0] ?? "").toLowerCase() === "total")).toBe(
      false,
    );
  });

  it("filters trailing junk rows like 'Filtros aplicados:' and per-community totals", async () => {
    const buffer = await buildWorkbookBuffer((wb) => {
      const sheet = wb.addWorksheet("USUARIOS");
      sheet.addRow([
        "NOMBRE",
        "CORREO",
        "TELEFONO",
        "PAIS",
        "DROPI ID",
        "ORDENES INGRESADAS",
        "ORDENES MOVILIZADAS",
        "ORDENES ENTREGADAS",
        "ORDENES DEVUELTAS",
      ]);
      sheet.addRow([
        "Ana",
        "ana@x.com",
        "+57300",
        "CO",
        "U1",
        5,
        4,
        3,
        1,
      ]);
      sheet.addRow([
        "Ecuador",
        "Total",
        "",
        "",
        "",
        99,
        99,
        99,
        9,
      ]);
      sheet.addRow(["Filtros aplicados: país=CO"]);
    });
    const result = await parseXlsxBuffer(buffer);
    const dataRows = result.matrix.slice(1);
    expect(dataRows.length).toBe(1);
    expect(dataRows[0][0]).toBe("Ana");
  });
});

describe("previewXlsx", () => {
  it("hashes the buffer and maps detected columns through previewMatrix", async () => {
    const buffer = await buildWorkbookBuffer((wb) => {
      const sheet = wb.addWorksheet("USUARIOS");
      sheet.addRow([
        "NOMBRE",
        "CORREO",
        "TELEFONO",
        "PAIS",
        "DROPI ID",
        "ORDENES INGRESADAS",
        "ORDENES MOVILIZADAS",
        "ORDENES ENTREGADAS",
        "ORDENES DEVUELTAS",
      ]);
      sheet.addRow([
        "Ana López",
        "ana@example.com",
        "+573001234567",
        "CO",
        "U1",
        10,
        8,
        7,
        1,
      ]);
      sheet.addRow([
        "Bruno Pérez",
        "bruno@example.com",
        "+525511112222",
        "MX",
        "U2",
        0,
        0,
        0,
        0,
      ]);
    });

    const preview = await previewXlsx(buffer);
    expect(preview.sheetName).toBe("USUARIOS");
    expect(preview.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.rowsTotal).toBe(2);
    expect(preview.rowsValid).toBe(2);
    expect(preview.rowsFailed).toBe(0);
    expect(preview.detectedColumns.fullName).toBeDefined();
    expect(preview.detectedColumns.ordersEntered).toBeDefined();
    expect(preview.parsedRows[0].fullName).toBe("Ana López");
    expect(preview.parsedRows[0].ordersEntered).toBe(10);
    expect(preview.parsedRows[0].ordersDelivered).toBe(7);
  });

  it("reports an empty workbook through the standard preview error path", async () => {
    const buffer = await buildWorkbookBuffer((wb) => {
      wb.addWorksheet("USUARIOS").addRow(["solo encabezado"]);
    });
    const preview = await previewXlsx(buffer);
    expect(preview.rowsTotal).toBe(0);
    expect(preview.errors.length).toBeGreaterThan(0);
  });
});
