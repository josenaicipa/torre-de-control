// XLSX parsing for Comunidad Dropi reports. Real Dropi exports have a pivot
// layout: row 1 is a grouping label (e.g. "abril"), row 2 holds most column
// headers, and the actual headers for the name/phone columns spill into
// row 3 because of merged cells; row 3 also doubles as a "Total" row. This
// module finds the right sheet, picks the best header window automatically
// by alias coverage, filters the totals/junk rows, and emits the same
// `string[][]` matrix shape the CSV path uses so `previewMatrix` does the
// rest of the work.
import ExcelJS from "exceljs";
import {
  computeFileHash,
  previewMatrix,
  scoreHeaderRow,
  type ImportPreviewResult,
} from "./comunidad-dropi-import";

// Cap how much of the workbook we walk in memory. Real reports top out at a
// few thousand rows, but we never want a runaway upload (or a sheet packed
// with junk after the data) to drag the process down.
const MAX_ROWS_SCAN = 20000;
const MAX_HEADER_SCAN_ROWS = 6;
const PREFERRED_SHEETS = ["USUARIOS", "Export", "EXPORT", "Usuarios"];

export interface XlsxParseResult {
  matrix: string[][];
  sheetName: string;
  rawRowCount: number;
}

function cellToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.error === "string") return "";
    if (v.result !== undefined) return cellToText(v.result);
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((part) => (part as { text?: unknown }).text ?? "")
        .map((t) => String(t ?? ""))
        .join("");
    }
    if (typeof v.hyperlink === "string") return v.hyperlink;
    return "";
  }
  return String(value);
}

function chooseSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  for (const name of PREFERRED_SHEETS) {
    const sheet = workbook.getWorksheet(name);
    if (sheet && sheet.actualRowCount > 0) return sheet;
  }
  let fallback: ExcelJS.Worksheet | null = null;
  workbook.eachSheet((sheet) => {
    if (!fallback && sheet.actualRowCount > 0) fallback = sheet;
  });
  if (!fallback) {
    throw new Error("El archivo XLSX no contiene hojas con datos");
  }
  return fallback;
}

function readSheetMatrix(sheet: ExcelJS.Worksheet): string[][] {
  const matrix: string[][] = [];
  const last = Math.min(sheet.actualRowCount, MAX_ROWS_SCAN);
  let maxCols = 0;
  for (let r = 1; r <= last; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push("");
      cells.push(cellToText(cell.value));
    });
    matrix.push(cells);
    if (cells.length > maxCols) maxCols = cells.length;
  }
  for (const row of matrix) {
    while (row.length < maxCols) row.push("");
  }
  return matrix;
}

interface HeaderWindow {
  combined: string[];
  startRow: number;
  endRow: number;
  score: number;
}

// Look at the first few rows of the sheet and pick the header window that
// maps the most known fields. We try 1-row and 2-row windows; for 2-row
// windows the value for each column is the first non-empty cell across the
// two rows (this is how merged headers like `NOMBRE` ending up in row 3
// get attached to the main header in row 2).
function detectHeaderWindow(matrix: string[][]): HeaderWindow {
  const scanLimit = Math.min(MAX_HEADER_SCAN_ROWS, matrix.length);
  let best: HeaderWindow = {
    combined: matrix[0] ?? [],
    startRow: 0,
    endRow: 0,
    score: scoreHeaderRow(matrix[0] ?? []),
  };
  for (let start = 0; start < scanLimit; start++) {
    const single = matrix[start] ?? [];
    const singleScore = scoreHeaderRow(single);
    if (singleScore > best.score) {
      best = { combined: single, startRow: start, endRow: start, score: singleScore };
    }
    if (start + 1 < scanLimit) {
      const next = matrix[start + 1] ?? [];
      const combined: string[] = [];
      const width = Math.max(single.length, next.length);
      for (let c = 0; c < width; c++) {
        const a = (single[c] ?? "").trim();
        const b = (next[c] ?? "").trim();
        combined.push(a || b);
      }
      const combinedScore = scoreHeaderRow(combined);
      if (combinedScore > best.score) {
        best = { combined, startRow: start, endRow: start + 1, score: combinedScore };
      }
    }
  }
  return best;
}

// Some report rows are recognizable junk: empty rows, summary "Total" rows,
// trailing rows that hold the pivot filter description ("Filtros
// aplicados: ..."), or rows that simply repeat header text. Filtering them
// out here keeps the downstream "row missing identifier" errors limited to
// real anomalies.
function isJunkRow(row: string[]): boolean {
  const nonEmpty = row.filter((c) => c && c.trim().length > 0);
  if (nonEmpty.length === 0) return true;
  const lowered = nonEmpty.map((c) => c.trim().toLowerCase());
  if (lowered[0]?.startsWith("filtros aplicados")) return true;
  // Heuristic: if both of the first two columns say "total" it is the
  // pivot grand-total row.
  if (lowered[0] === "total" && lowered[1] === "total") return true;
  // Some monthly reports keep a per-community total: the second column says
  // "Total" while the first names the community.
  if (lowered[1] === "total") return true;
  return false;
}

export async function parseXlsxBuffer(
  buffer: ArrayBuffer | Buffer,
): Promise<XlsxParseResult> {
  const workbook = new ExcelJS.Workbook();
  const ab =
    buffer instanceof ArrayBuffer
      ? buffer
      : buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        );
  await workbook.xlsx.load(ab as ArrayBuffer);
  const sheet = chooseSheet(workbook);
  const rawMatrix = readSheetMatrix(sheet);
  if (rawMatrix.length === 0) {
    return { matrix: [], sheetName: sheet.name, rawRowCount: 0 };
  }
  const window = detectHeaderWindow(rawMatrix);
  const dataRows = rawMatrix
    .slice(window.endRow + 1)
    .filter((row) => !isJunkRow(row));
  const matrix = [window.combined, ...dataRows];
  return {
    matrix,
    sheetName: sheet.name,
    rawRowCount: rawMatrix.length,
  };
}

export interface XlsxPreviewResult extends ImportPreviewResult {
  sheetName: string;
}

export async function previewXlsx(
  buffer: Buffer,
): Promise<XlsxPreviewResult> {
  const { matrix, sheetName } = await parseXlsxBuffer(buffer);
  const fileHash = computeFileHash(buffer);
  const preview = previewMatrix(matrix, fileHash);
  return { ...preview, sheetName };
}
