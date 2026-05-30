// Excel import pipeline for Comunidad Dropi. The Excel parsing itself is
// intentionally tiny: we accept a CSV-ish representation (header row + rows of
// strings) so the API route can decide whether the upload is a `.csv` or an
// `.xlsx` that has already been parsed by another tool. Release 2 will add a
// proper xlsx parser; for Release 1 the operator can paste CSV from the Dropi
// report and the same pipeline runs.
import { createHash } from "node:crypto";
import {
  normalizeCountry,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
  safeRate,
} from "./comunidad-dropi-normalize";

export interface ParsedRow {
  rowNumber: number;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  dropiExternalId: string | null;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  movementRate: number;
  deliveryRate: number;
  returnRate: number;
  raw: Record<string, string>;
}

export interface RowError {
  rowNumber: number;
  message: string;
  raw: Record<string, string>;
}

export interface ImportPreviewResult {
  fileHash: string;
  rowsTotal: number;
  rowsValid: number;
  rowsFailed: number;
  parsedRows: ParsedRow[];
  errors: RowError[];
  detectedColumns: Record<string, string>;
}

// Header aliases — Dropi reports come with slightly different column names
// per country / week. Add new aliases here, never silently parse a column we
// don't know.
const HEADER_ALIASES: Record<string, string[]> = {
  fullName: [
    "nombre",
    "nombre completo",
    "vendedor",
    "vendedora",
    "seller",
    "nombre vendedor",
  ],
  email: ["correo", "email", "correo electronico", "correo electrónico", "e-mail"],
  phone: ["telefono", "teléfono", "celular", "phone", "whatsapp"],
  country: ["pais", "país", "country"],
  dropiExternalId: ["dropi id", "id dropi", "id_dropi", "user_id", "user id"],
  ordersEntered: [
    "ordenes ingresadas",
    "órdenes ingresadas",
    "pedidos ingresados",
    "ingresadas",
    "ordenes",
    "órdenes",
  ],
  ordersMoved: [
    "ordenes movilizadas",
    "órdenes movilizadas",
    "movilizadas",
    "pedidos movilizados",
  ],
  ordersDelivered: [
    "ordenes entregadas",
    "órdenes entregadas",
    "entregadas",
    "pedidos entregados",
  ],
  ordersReturned: [
    "ordenes devueltas",
    "órdenes devueltas",
    "devueltas",
    "pedidos devueltos",
  ],
};

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    current.push(cell);
    cell = "";
  };
  const pushRow = () => {
    rows.push(current);
    current = [];
  };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushCell();
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || current.length > 0) {
    pushCell();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[áä]/g, "a")
    .replace(/[éë]/g, "e")
    .replace(/[íï]/g, "i")
    .replace(/[óö]/g, "o")
    .replace(/[úü]/g, "u")
    .replace(/\s+/g, " ");
}

function buildColumnMap(
  headers: string[],
): Record<keyof typeof HEADER_ALIASES, number | null> {
  const map = {} as Record<keyof typeof HEADER_ALIASES, number | null>;
  for (const field of Object.keys(HEADER_ALIASES) as Array<
    keyof typeof HEADER_ALIASES
  >) {
    map[field] = null;
    const aliases = HEADER_ALIASES[field];
    for (let i = 0; i < headers.length; i++) {
      const h = normalizeHeader(headers[i] ?? "");
      if (aliases.includes(h)) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

function parseIntCell(cell: string | undefined): number {
  if (cell == null) return 0;
  const trimmed = String(cell).trim();
  if (!trimmed) return 0;
  const digits = trimmed.replace(/[^\d-]/g, "");
  if (!digits || digits === "-") return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

export function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function previewCsv(
  fileContent: string,
): ImportPreviewResult {
  const matrix = parseCsv(fileContent);
  const fileHash = computeFileHash(fileContent);

  if (matrix.length < 2) {
    return {
      fileHash,
      rowsTotal: 0,
      rowsValid: 0,
      rowsFailed: 0,
      parsedRows: [],
      errors: [
        {
          rowNumber: 0,
          message: "Archivo vacío o sin filas de datos",
          raw: {},
        },
      ],
      detectedColumns: {},
    };
  }

  const headers = matrix[0];
  const columnMap = buildColumnMap(headers);
  const detectedColumns: Record<string, string> = {};
  for (const [field, idx] of Object.entries(columnMap)) {
    if (idx != null) detectedColumns[field] = headers[idx] ?? "";
  }

  const parsedRows: ParsedRow[] = [];
  const errors: RowError[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = row[idx] ?? "";
    });

    const fullName = normalizeFullName(
      pickCell(row, columnMap.fullName),
    );
    const email = normalizeEmail(pickCell(row, columnMap.email));
    const phone = normalizePhone(pickCell(row, columnMap.phone));
    const country = normalizeCountry(pickCell(row, columnMap.country));
    const dropiExternalId = pickCell(row, columnMap.dropiExternalId)?.trim() || null;

    if (!fullName && !email && !phone && !dropiExternalId) {
      errors.push({
        rowNumber: i + 1,
        message: "Fila sin identificador (nombre, correo, teléfono o ID Dropi)",
        raw,
      });
      continue;
    }

    const ordersEntered = parseIntCell(pickCell(row, columnMap.ordersEntered));
    const ordersMoved = parseIntCell(pickCell(row, columnMap.ordersMoved));
    const ordersDelivered = parseIntCell(
      pickCell(row, columnMap.ordersDelivered),
    );
    const ordersReturned = parseIntCell(
      pickCell(row, columnMap.ordersReturned),
    );

    parsedRows.push({
      rowNumber: i + 1,
      fullName,
      email,
      phone,
      country,
      dropiExternalId,
      ordersEntered,
      ordersMoved,
      ordersDelivered,
      ordersReturned,
      movementRate: safeRate(ordersMoved, ordersEntered),
      deliveryRate: safeRate(ordersDelivered, Math.max(ordersMoved, ordersEntered)),
      returnRate: safeRate(ordersReturned, Math.max(ordersMoved, ordersEntered)),
      raw,
    });
  }

  return {
    fileHash,
    rowsTotal: matrix.length - 1,
    rowsValid: parsedRows.length,
    rowsFailed: errors.length,
    parsedRows,
    errors,
    detectedColumns,
  };
}

function pickCell(row: string[], idx: number | null): string {
  if (idx == null) return "";
  return row[idx] ?? "";
}
