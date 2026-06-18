import { createHash } from "node:crypto";
import {
  CONTRACT_ACCEPTANCE_TEXT,
  CONTRACT_TEMPLATE_VERSION,
  buildContractView,
  type ContractInput,
  type ManualClause,
} from "./operaciones-contract-template";

// Capa compartida entre la página pública de firma, las APIs (crear link,
// firmar, aprobar) y el generador de PDF. Centraliza tres cosas para que
// todos los flujos coincidan:
//   1) qué datos legales son obligatorios antes de emitir un contrato,
//   2) cómo se arma el ContractInput a partir de los datos en Torre,
//   3) cómo se calcula y verifica el hash de la firma electrónica.

export interface ContractScheduleShape {
  installmentNumber: number;
  amountDue: number | string | { toString(): string };
  currency: string;
  dueDate: Date | string;
}

// Forma mínima de los datos que necesita el flujo de contrato. Se mantiene
// laxa (number | string | Decimal) para aceptar tanto filas de Prisma como
// objetos planos de los tests sin acoplarse al cliente generado.
export interface ContractDataShape {
  student: {
    fullName: string;
    legalName: string | null;
    email: string;
    phone: string | null;
    documentType: string | null;
    documentNumber: string | null;
    legalAddress: string | null;
    legalCity: string | null;
    legalState: string | null;
    legalCountry: string | null;
    startDate: Date | string | null;
    endDate: Date | string | null;
  };
  product: { name: string } | null;
  totalAmountUsd: number | string | { toString(): string } | null;
  initialPaymentUsd: number | string | { toString(): string } | null;
  balanceUsd: number | string | { toString(): string } | null;
  startedAt: Date | string | null;
  endsAt: Date | string | null;
  paymentSchedules: ContractScheduleShape[];
}

// Select Prisma reutilizable: trae todo lo necesario para validar, renderizar
// y firmar el contrato de una inscripción.
export const contractEnrollmentSelect = {
  id: true,
  totalAmountUsd: true,
  initialPaymentUsd: true,
  balanceUsd: true,
  currency: true,
  startedAt: true,
  endsAt: true,
  contractStatus: true,
  contractSignedAt: true,
  contractSignerName: true,
  contractSignedIp: true,
  contractSignedUserAgent: true,
  contractTemplateVersion: true,
  contractManualClausesSnapshot: true,
  contractStudentSignatureHash: true,
  contractStudentSignatureImage: true,
  contractCeoSignerName: true,
  contractCeoSignedAt: true,
  contractCeoSignatureHash: true,
  contractCeoSignatureImage: true,
  contractApprovedAt: true,
  student: {
    select: {
      fullName: true,
      legalName: true,
      email: true,
      phone: true,
      documentType: true,
      documentNumber: true,
      legalAddress: true,
      legalCity: true,
      legalState: true,
      legalCountry: true,
      startDate: true,
      endDate: true,
    },
  },
  product: { select: { name: true } },
  paymentSchedules: {
    orderBy: { installmentNumber: "asc" as const },
    select: {
      id: true,
      installmentNumber: true,
      amountDue: true,
      currency: true,
      dueDate: true,
    },
  },
} as const;

function toNumberOrNull(
  value: number | string | { toString(): string } | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(num) ? num : null;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    return match ? value.slice(0, 10) : null;
  }
  return value.toISOString().slice(0, 10);
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface MissingField {
  field: string;
  label: string;
}

// Devuelve la lista de datos legales/comerciales que faltan para poder emitir
// el contrato. Si está vacía, el contrato puede generarse y firmarse.
export function findMissingContractFields(data: ContractDataShape): MissingField[] {
  const missing: MissingField[] = [];
  const add = (field: string, label: string) => missing.push({ field, label });

  if (!nonEmpty(data.student.legalName)) add("legalName", "Nombre legal completo");
  if (!nonEmpty(data.student.email)) add("email", "Correo electrónico");
  if (!nonEmpty(data.student.phone)) add("phone", "Teléfono");
  if (!nonEmpty(data.student.documentType)) add("documentType", "Tipo de documento");
  if (!nonEmpty(data.student.documentNumber))
    add("documentNumber", "Número de documento");
  if (!nonEmpty(data.student.legalAddress))
    add("legalAddress", "Dirección / domicilio");
  if (!nonEmpty(data.student.legalCity)) add("legalCity", "Ciudad");
  if (!nonEmpty(data.student.legalState))
    add("legalState", "Departamento / Estado / Provincia");
  if (!nonEmpty(data.student.legalCountry)) add("legalCountry", "País");

  if (!data.product || !nonEmpty(data.product.name)) add("product", "Producto");

  const total = toNumberOrNull(data.totalAmountUsd);
  if (total === null || total <= 0) add("totalAmountUsd", "Valor total (USD)");

  if (toNumberOrNull(data.initialPaymentUsd) === null)
    add("initialPaymentUsd", "Pago inicial definido");

  const balance = toNumberOrNull(data.balanceUsd);
  if (balance === null) add("balanceUsd", "Saldo (USD) definido");

  const startDate = isoDate(data.startedAt) ?? isoDate(data.student.startDate);
  if (!startDate) add("startDate", "Fecha de acuerdo / inicio");

  const endDate = isoDate(data.student.endDate) ?? isoDate(data.endsAt);
  if (!endDate) add("endDate", "Fecha de finalización");

  // Si hay saldo pendiente, debe existir al menos una cuota que lo respalde.
  if (balance !== null && balance > 0 && data.paymentSchedules.length === 0) {
    add(
      "paymentSchedule",
      "Cronograma de cuotas para el saldo pendiente",
    );
  }

  return missing;
}

export function isContractComplete(data: ContractDataShape): boolean {
  return findMissingContractFields(data).length === 0;
}

function composeDocument(data: ContractDataShape): string | null {
  const type = data.student.documentType?.trim();
  const number = data.student.documentNumber?.trim();
  if (!type && !number) return null;
  if (type && number) return `${type} N° ${number}`;
  return type ?? number ?? null;
}

function composeAddress(data: ContractDataShape): string | null {
  const parts = [
    data.student.legalAddress?.trim(),
    data.student.legalCity?.trim(),
    data.student.legalState?.trim(),
    data.student.legalCountry?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length > 0 ? parts.join(", ") : null;
}

// ─── Cláusulas manuales configurables ────────────────────────────────────────

// Topes para acotar el tamaño de las cláusulas manuales y evitar abusos.
export const MANUAL_CLAUSE_LIMITS = {
  maxClauses: 10,
  maxParagraphsPerClause: 30,
  maxHeadingLength: 120,
  maxParagraphLength: 4000,
} as const;

// Normaliza un valor arbitrario (típicamente JSON del settings o del body de la
// API) en una lista de cláusulas manuales válidas. Es tolerante: descarta lo
// que no encaje (entradas no-objeto, encabezados vacíos, párrafos vacíos) en
// lugar de fallar, recorta espacios y aplica los topes. Devuelve [] si no hay
// nada utilizable, de modo que un contrato sin cláusulas manuales sea el caso
// por defecto.
// Parsea el snapshot JSON de cláusulas manuales congeladas en el enrollment.
// Devuelve null cuando el snapshot todavía no se tomó (el contrato no llegó a
// PENDING_SIGNATURE) y [] si el snapshot existe pero quedó vacío. El JSON se
// normaliza con parseManualClauses para descartar entradas corruptas.
export function parseManualClausesSnapshot(
  snapshot: string | null | undefined,
): ManualClause[] | null {
  if (snapshot === null || snapshot === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return [];
  }
  return parseManualClauses(parsed);
}

// Serializa una lista de cláusulas para guardarla como snapshot en el
// enrollment. Normaliza antes de serializar para que la BD nunca contenga
// entradas inválidas.
export function serializeManualClausesSnapshot(
  clauses: ManualClause[],
): string {
  return JSON.stringify(parseManualClauses(clauses));
}

export function parseManualClauses(value: unknown): ManualClause[] {
  if (!Array.isArray(value)) return [];
  const clauses: ManualClause[] = [];
  for (const raw of value) {
    if (clauses.length >= MANUAL_CLAUSE_LIMITS.maxClauses) break;
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { heading?: unknown; paragraphs?: unknown };
    const heading =
      typeof candidate.heading === "string"
        ? candidate.heading.trim().slice(0, MANUAL_CLAUSE_LIMITS.maxHeadingLength)
        : "";
    if (!heading) continue;
    if (!Array.isArray(candidate.paragraphs)) continue;
    const paragraphs = candidate.paragraphs
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim().slice(0, MANUAL_CLAUSE_LIMITS.maxParagraphLength))
      .filter((p) => p.length > 0)
      .slice(0, MANUAL_CLAUSE_LIMITS.maxParagraphsPerClause);
    if (paragraphs.length === 0) continue;
    clauses.push({ heading, paragraphs });
  }
  return clauses;
}

// Arma el ContractInput canónico a partir de los datos en Torre. `signedAt`
// permite fijar la fecha de acuerdo a la firma real; si falta se usa hoy.
// `manualClauses` anexa cláusulas configurables al final del contrato; se
// normalizan para que el input canónico no contenga entradas inválidas.
export function buildContractInputFromData(
  data: ContractDataShape,
  signedAt?: Date | string | null,
  manualClauses?: ManualClause[],
): ContractInput {
  const clientName = data.student.legalName?.trim() || data.student.fullName;
  const agreementDate =
    isoDate(signedAt ?? null) ??
    isoDate(data.startedAt) ??
    isoDate(data.student.startDate) ??
    new Date().toISOString().slice(0, 10);
  const endDate = isoDate(data.student.endDate) ?? isoDate(data.endsAt);

  const installments = data.paymentSchedules.map((s) => ({
    number: s.installmentNumber,
    amountUsd: toNumberOrNull(s.amountDue) ?? 0,
    currency: s.currency,
    dueDate: isoDate(s.dueDate) ?? "",
  }));

  return {
    clientName,
    clientEmail: data.student.email,
    clientDocument: composeDocument(data),
    clientAddress: composeAddress(data),
    productName: data.product?.name ?? "",
    totalAmountUsd: toNumberOrNull(data.totalAmountUsd) ?? 0,
    initialPaymentUsd: toNumberOrNull(data.initialPaymentUsd) ?? 0,
    balanceUsd: toNumberOrNull(data.balanceUsd) ?? 0,
    installments,
    agreementDate,
    endDate,
    manualClauses: parseManualClauses(manualClauses ?? []),
  };
}

// ─── Imagen de la firma manuscrita ───────────────────────────────────────────

// Límite de tamaño de la imagen de firma decodificada: 1 MB.
export const SIGNATURE_IMAGE_MAX_BYTES = 1_048_576;

export type SignatureImageMime = "image/png" | "image/jpeg";

export type SignatureImageValidation =
  | {
      ok: true;
      mime: SignatureImageMime;
      base64: string;
      bytes: number;
      dataUrl: string;
    }
  | { ok: false; error: string };

// Tamaño en bytes de un base64 sin decodificarlo (válido en navegador y server,
// sin depender de Buffer).
function base64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

// Valida que el valor sea una data URL de imagen PNG o JPEG de máximo 1 MB.
// Rechaza otros formatos (webp, gif, svg, etc.), data URLs malformadas y
// tamaños excesivos. Devuelve la data URL normalizada para almacenar.
export function validateSignatureImage(value: unknown): SignatureImageValidation {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Sube una foto de tu firma para continuar" };
  }
  const trimmed = value.trim();
  const match =
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: "La firma debe ser una imagen PNG o JPEG válida",
    };
  }
  const mime = match[1] as SignatureImageMime;
  const base64 = match[2];
  const bytes = base64ByteLength(base64);
  if (bytes <= 0) {
    return { ok: false, error: "La imagen de la firma está vacía" };
  }
  if (bytes > SIGNATURE_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "La imagen de la firma supera el límite de 1 MB",
    };
  }
  return { ok: true, mime, base64, bytes, dataUrl: `data:${mime};base64,${base64}` };
}

// ─── Firma electrónica: hash + verificación de nombre ────────────────────────

// Representación canónica de lo que el estudiante firma: versión de plantilla,
// datos interpolados y vista renderizada del contrato. No incluye la firma en
// sí para que el hash represente el CONTENIDO aceptado.
export function canonicalContractPayload(input: ContractInput): string {
  const view = buildContractView(input);
  return JSON.stringify({
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    input,
    view,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Hash de la firma del estudiante: contenido del contrato + nombre del
// firmante + texto de aceptación + huella de la imagen de firma (si existe).
// La imagen se incorpora como su propio sha256 para que el hash quede acotado
// y sirva de evidencia de la firma manuscrita aceptada.
export function computeStudentSignatureHash(
  input: ContractInput,
  signerName: string,
  signatureImage?: string | null,
): string {
  const imageDigest = signatureImage?.trim() ? sha256(signatureImage.trim()) : "";
  return sha256(
    `${canonicalContractPayload(input)}::signer=${signerName.trim()}::accept=${CONTRACT_ACCEPTANCE_TEXT}::image=${imageDigest}`,
  );
}

// Hash de la firma del CEO: encadena el hash del estudiante con la identidad
// del CEO y la fecha de aprobación.
export function computeCeoSignatureHash(
  studentSignatureHash: string,
  ceoName: string,
  ceoSignedAt: Date,
): string {
  return sha256(
    `${studentSignatureHash}::ceo=${ceoName.trim()}::at=${ceoSignedAt.toISOString()}`,
  );
}

// Normaliza un nombre para comparación: minúsculas, sin acentos, sin signos de
// puntuación y con espacios colapsados.
export function normalizeNameForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ¿El nombre firmado coincide razonablemente con el nombre legal/registrado?
// No es biometría: exige igualdad normalizada o que compartan al menos dos
// tokens significativos (nombre + apellido), tolerando orden distinto.
export function namesReasonablyMatch(signed: string, expected: string): boolean {
  const a = normalizeNameForMatch(signed);
  const b = normalizeNameForMatch(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 2));
  const bTokens = b.split(" ").filter((t) => t.length >= 2);
  const shared = bTokens.filter((t) => aTokens.has(t));
  return shared.length >= 2;
}
