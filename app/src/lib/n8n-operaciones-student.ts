// Helpers puros para el webhook n8n (disparado por GHL) que materializa una
// ficha mínima de estudiante en Torre. Se extraen del route para poder
// testearlos sin Next/Prisma/red.
//
// Regla de negocio clave: desde GHL/n8n SOLO entra nombre, correo, teléfono y
// (opcional) ghlContactId / carpeta Drive. NO se normaliza producto, programa,
// duración, fecha de inicio, estado comercial ni datos legales aunque el
// payload los traiga — todo eso se diligencia manualmente en Torre. La ficha se
// crea como pendiente de completar: estado INACTIVE y durationAssumed=true (la
// duración guardada es solo un default técnico que el schema exige, no real).

import type { Prisma } from "@prisma/client";
import { normalizeEmail } from "@/lib/operaciones-signature-flow";
import { calculateEndDate } from "@/domain/students";

// Default técnico de duración. La ficha queda con durationAssumed=true para que
// la UI nunca muestre esto como una duración real hasta que se normalice.
export const N8N_DEFAULT_DURATION_MONTHS = 12;

export interface N8nParsedFields {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

// Coacciona un valor del payload a string no vacío, tolerando números.
function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

// Primer alias con valor no vacío.
function pick(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(raw[key]);
    if (value) return value;
  }
  return null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

// Extrae únicamente los campos que GHL/n8n tiene permitido aportar. Cualquier
// otro campo del payload (programa, duración, estado, fechas, datos legales,
// mentor, contrato, etc.) se ignora a propósito.
export function parseN8nStudentFields(
  raw: Record<string, unknown>,
): N8nParsedFields {
  const firstName = pick(raw, ["first_name", "firstName"]);
  const lastName = pick(raw, ["last_name", "lastName"]);
  const explicitFullName = pick(raw, ["fullName", "full_name", "name"]);
  const composedName =
    explicitFullName ?? ([firstName, lastName].filter(Boolean).join(" ") || null);

  const rawEmail = pick(raw, ["email"]);
  const email = normalizeEmail(rawEmail);

  return {
    fullName: composedName,
    email: email && EMAIL_REGEX.test(email) ? email : null,
    phone: pick(raw, ["phone"]),
    ghlContactId: pick(raw, ["ghlContactId", "contactId", "contact_id", "id"]),
    driveFolderId: pick(raw, ["driveFolderId"]),
    driveFolderUrl: pick(raw, ["driveFolderUrl", "drive_folder_url"]),
  };
}

// Datos de carpeta Drive: cuando vienen, marcamos la sincronización igual que
// el webhook dedicado de drive-folder.
export function buildN8nDriveData(
  fields: N8nParsedFields,
): Partial<Prisma.StudentUncheckedCreateInput> {
  if (!fields.driveFolderId && !fields.driveFolderUrl) return {};
  return {
    driveFolderId: fields.driveFolderId ?? undefined,
    driveFolderUrl: fields.driveFolderUrl ?? null,
    driveFolderSource: "n8n_ghl_webhook",
    driveFolderSyncedAt: new Date(),
    driveFolderSyncStatus: "synced",
    driveFolderSyncError: null,
  };
}

// Construye el `data` de creación de una ficha mínima pendiente. `email` debe
// venir resuelto (el route valida que exista antes de llamar). startDate y
// durationMonths son defaults técnicos; durationAssumed=true y status INACTIVE
// dejan claro que NO es un estudiante activo normalizado.
export function buildN8nStudentCreateData(
  fields: N8nParsedFields,
  now: Date = new Date(),
): Prisma.StudentUncheckedCreateInput {
  const email = fields.email;
  if (!email) {
    throw new Error("buildN8nStudentCreateData requiere email resuelto");
  }
  const startDate = new Date(now.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const durationMonths = N8N_DEFAULT_DURATION_MONTHS;

  return {
    fullName: fields.fullName ?? emailLocalPart(email),
    email,
    phone: fields.phone ?? null,
    startDate,
    durationMonths,
    endDate: calculateEndDate(startDate, durationMonths),
    status: "INACTIVE",
    durationAssumed: true,
    ghlContactId: fields.ghlContactId ?? null,
    ...buildN8nDriveData(fields),
  };
}

// Construye el `data` de actualización de una ficha ya existente. Solo toca
// nombre/correo/teléfono/ghlContactId y carpeta Drive, y únicamente cuando el
// valor entrante está presente: nunca sobreescribe datos ya diligenciados en
// Torre con vacíos ni con defaults externos (estado, duración, fechas, legal).
export function buildN8nStudentUpdateData(
  fields: N8nParsedFields,
): Prisma.StudentUpdateInput {
  const data: Prisma.StudentUpdateInput = { ...buildN8nDriveData(fields) };
  if (fields.fullName) data.fullName = fields.fullName;
  if (fields.email) data.email = fields.email;
  if (fields.phone) data.phone = fields.phone;
  if (fields.ghlContactId) data.ghlContactId = fields.ghlContactId;
  return data;
}
