// Defensive validation for Comunidad Dropi upload payloads. We do not trust
// the client to send a payload within sane bounds, so before any parsing we
// require exactly one content field, enforce explicit size limits, and reject
// xlsxBase64 strings that are not canonical base64. Producing a clean Spanish
// error here means the route can return 400 without crashing inside
// Buffer.from / ExcelJS on hostile input.

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_XLSX_BINARY_BYTES = 10 * 1024 * 1024;

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export type ValidatedUpload =
  | { kind: "csv"; csvContent: string }
  | { kind: "xlsx"; xlsxBuffer: Buffer };

export function validateUploadPayload(input: {
  csvContent?: string | null | undefined;
  xlsxBase64?: string | null | undefined;
}): ValidatedUpload {
  const hasCsv =
    typeof input.csvContent === "string" && input.csvContent.length > 0;
  const hasXlsx =
    typeof input.xlsxBase64 === "string" && input.xlsxBase64.length > 0;
  if (hasCsv && hasXlsx) {
    throw new UploadValidationError(
      "Envía solo csvContent o xlsxBase64, no ambos a la vez",
    );
  }
  if (!hasCsv && !hasXlsx) {
    throw new UploadValidationError(
      "Debes enviar csvContent o xlsxBase64",
    );
  }
  if (hasCsv) {
    const csv = input.csvContent as string;
    if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
      throw new UploadValidationError(
        `El CSV supera el tamaño máximo permitido de ${formatMb(MAX_CSV_BYTES)}`,
      );
    }
    return { kind: "csv", csvContent: csv };
  }
  // Tolerate accidental whitespace inserted by the transport, but reject any
  // other deviation from canonical base64 below.
  const raw = (input.xlsxBase64 as string).replace(/\s+/g, "");
  if (raw.length === 0) {
    throw new UploadValidationError("El contenido XLSX está vacío");
  }
  if (raw.length % 4 !== 0 || !BASE64_REGEX.test(raw)) {
    throw new UploadValidationError(
      "El contenido XLSX no es base64 válido",
    );
  }
  // Upper-bound on decoded size so we never allocate a buffer larger than the
  // limit just to reject it afterwards.
  const approxBytes = (raw.length / 4) * 3;
  if (approxBytes > MAX_XLSX_BINARY_BYTES + 4) {
    throw new UploadValidationError(
      `El archivo XLSX supera el tamaño máximo permitido de ${formatMb(MAX_XLSX_BINARY_BYTES)}`,
    );
  }
  const buffer = Buffer.from(raw, "base64");
  if (buffer.length === 0) {
    throw new UploadValidationError("El contenido XLSX está vacío");
  }
  if (buffer.length > MAX_XLSX_BINARY_BYTES) {
    throw new UploadValidationError(
      `El archivo XLSX supera el tamaño máximo permitido de ${formatMb(MAX_XLSX_BINARY_BYTES)}`,
    );
  }
  // Buffer.from drops invalid characters silently, so re-encode and compare to
  // ensure the input was truly canonical base64 (catches hidden corruption
  // that the regex alone would miss).
  if (buffer.toString("base64") !== raw) {
    throw new UploadValidationError(
      "El contenido XLSX no es base64 válido",
    );
  }
  return { kind: "xlsx", xlsxBuffer: buffer };
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
