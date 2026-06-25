import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, StudentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { calculateEndDate } from "@/domain/students";
import {
  normalizeEmail,
  normalizePhone,
  pickStudentMatch,
  type StudentMatchCandidate,
} from "@/lib/operaciones-signature-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// n8n (disparado por GHL) crea/actualiza el estudiante básico en Torre con los
// datos del contacto. Autenticado solo por el secreto compartido
// N8N_TORRE_WEBHOOK_SECRET (header x-n8n-webhook-secret / x-webhook-secret /
// Authorization Bearer); el secreto se compara con timingSafeEqual y jamás se
// loguea. Este endpoint NO crea inscripción, pago, contrato ni acceso a
// LearnWorlds: solo materializa/actualiza el Student para que el resto del
// flujo operativo lo encuentre. El payload de GHL es laxo (varios alias por
// campo), así que se extrae campo a campo en vez de exigir un shape rígido.

const STUDENT_STATUS_VALUES: readonly StudentStatus[] = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "DROPPED",
  "EXTENDED",
  "ACCESS_REVOKED",
  "SEPARATED",
  "INACTIVE",
  "WITHDRAWN",
];

function configuredSecret(): string | null {
  const value = process.env.N8N_TORRE_WEBHOOK_SECRET;
  return value && value.length >= 16 ? value : null;
}

function presentedSecret(req: NextRequest): string | null {
  const header =
    req.headers.get("x-n8n-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("authorization");
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, "").trim() || null;
}

function secretMatches(expected: string, presented: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

function parseStartDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 60) return null;
  return n;
}

// El estado de GHL llega como texto libre. Mapeamos a StudentStatus solo cuando
// es inequívoco; si no, devolvemos null (en creación se usa el default ACTIVE y
// en actualización se deja el estado intacto). "separado"/"separación" ->
// SEPARATED por requisito explícito del flujo.
function resolveStatus(raw: string | null): StudentStatus | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const upper = value.toUpperCase();
  if (STUDENT_STATUS_VALUES.includes(upper as StudentStatus)) {
    return upper as StudentStatus;
  }
  if (value.includes("separa")) return "SEPARATED";
  if (value.includes("activ")) return "ACTIVE";
  if (value.includes("pausa")) return "PAUSED";
  return null;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedFields {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  ghlContactId: string | null;
  startDate: Date | null;
  durationMonths: number | null;
  status: StudentStatus | null;
  notes: string | null;
  personality: string | null;
  legalName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  legalAddress: string | null;
  legalCity: string | null;
  legalState: string | null;
  legalCountry: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

function parseFields(raw: Record<string, unknown>): ParsedFields {
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
    ghlContactId: pick(raw, [
      "ghlContactId",
      "contactId",
      "contact_id",
      "id",
    ]),
    startDate: parseStartDate(
      pick(raw, ["startDate", "fecha_ingreso", "fecha_inicio"]),
    ),
    durationMonths: parseDuration(
      pick(raw, ["durationMonths", "meses", "duration_months"]),
    ),
    status: resolveStatus(pick(raw, ["status", "estado", "estado_llamada"])),
    notes: pick(raw, ["notes"]),
    personality: pick(raw, ["personality"]),
    legalName: pick(raw, ["legalName", "nombre_legal"]),
    documentType: pick(raw, ["documentType"]),
    documentNumber: pick(raw, ["documentNumber", "documento"]),
    legalAddress: pick(raw, ["legalAddress"]),
    legalCity: pick(raw, ["legalCity"]),
    legalState: pick(raw, ["legalState"]),
    legalCountry: pick(raw, ["legalCountry"]),
    driveFolderId: pick(raw, ["driveFolderId"]),
    driveFolderUrl: pick(raw, ["driveFolderUrl", "drive_folder_url"]),
  };
}

export async function POST(req: NextRequest) {
  try {
    const expected = configuredSecret();
    if (!expected) {
      return jsonError(
        503,
        "Integración n8n no configurada en el servidor (falta N8N_TORRE_WEBHOOK_SECRET)",
      );
    }
    const presented = presentedSecret(req);
    if (!presented || !secretMatches(expected, presented)) {
      return jsonError(401, "Secreto de webhook inválido");
    }

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return jsonError(400, "Payload inválido: se esperaba un objeto JSON");
    }
    const fields = parseFields(raw as Record<string, unknown>);

    const matchedId = await findMatchingStudentId(fields);

    // Datos de carpeta Drive: cuando vienen, marcamos la sincronización igual
    // que el webhook dedicado de drive-folder.
    const driveData: Partial<Prisma.StudentUncheckedCreateInput> =
      fields.driveFolderId || fields.driveFolderUrl
        ? {
            driveFolderId: fields.driveFolderId ?? undefined,
            driveFolderUrl: fields.driveFolderUrl ?? null,
            driveFolderSource: "n8n_ghl_webhook",
            driveFolderSyncedAt: new Date(),
            driveFolderSyncStatus: "synced",
            driveFolderSyncError: null,
          }
        : {};

    if (matchedId) {
      const existing = await prisma.student.findUnique({
        where: { id: matchedId },
        select: { startDate: true, durationMonths: true },
      });
      if (!existing) {
        // Carrera improbable: el estudiante desapareció entre el match y el
        // update. Tratamos como no encontrado para no romper.
        return jsonError(409, "El estudiante coincidente ya no existe");
      }

      const data: Prisma.StudentUpdateInput = { ...driveData };
      if (fields.fullName) data.fullName = fields.fullName;
      if (fields.email) data.email = fields.email;
      if (fields.phone) data.phone = fields.phone;
      if (fields.ghlContactId) data.ghlContactId = fields.ghlContactId;
      if (fields.status) data.status = fields.status;
      if (fields.notes) data.notes = fields.notes;
      if (fields.personality) data.personality = fields.personality;
      if (fields.legalName) data.legalName = fields.legalName;
      if (fields.documentType) data.documentType = fields.documentType;
      if (fields.documentNumber) data.documentNumber = fields.documentNumber;
      if (fields.legalAddress) data.legalAddress = fields.legalAddress;
      if (fields.legalCity) data.legalCity = fields.legalCity;
      if (fields.legalState) data.legalState = fields.legalState;
      if (fields.legalCountry) data.legalCountry = fields.legalCountry;

      // Solo recomputamos endDate si cambia startDate o durationMonths, usando
      // los valores efectivos (nuevos o los ya guardados) para no degradar la
      // fila existente.
      if (fields.startDate || fields.durationMonths) {
        const effStart = fields.startDate ?? existing.startDate;
        const effDuration = fields.durationMonths ?? existing.durationMonths;
        if (fields.startDate) data.startDate = fields.startDate;
        if (fields.durationMonths) data.durationMonths = fields.durationMonths;
        data.endDate = calculateEndDate(effStart, effDuration);
      }

      const student = await prisma.student.update({
        where: { id: matchedId },
        data,
        select: studentResponseSelect,
      });
      await writeAudit({
        actorId: null,
        action: "integrations.n8n.operaciones_student.updated",
        target: student.id,
        metadata: {
          ghlContactId: student.ghlContactId,
          driveFolderSynced: Boolean(fields.driveFolderId || fields.driveFolderUrl),
        },
      });
      return NextResponse.json({ created: false, student });
    }

    // No existe: creamos con defaults seguros. Email es obligatorio para crear
    // (es la clave única); fullName se deriva si no vino explícito.
    if (!fields.email) {
      return jsonError(
        400,
        "email requerido para crear un estudiante nuevo",
      );
    }
    const fullName = fields.fullName ?? emailLocalPart(fields.email);
    const startDate = fields.startDate ?? new Date(todayUtcDateString() + "T00:00:00.000Z");
    const durationMonths = fields.durationMonths ?? 12;

    const student = await prisma.student.create({
      data: {
        fullName,
        email: fields.email,
        phone: fields.phone ?? null,
        startDate,
        durationMonths,
        endDate: calculateEndDate(startDate, durationMonths),
        status: fields.status ?? "ACTIVE",
        ghlContactId: fields.ghlContactId ?? null,
        notes: fields.notes ?? null,
        personality: fields.personality ?? null,
        legalName: fields.legalName ?? null,
        documentType: fields.documentType ?? null,
        documentNumber: fields.documentNumber ?? null,
        legalAddress: fields.legalAddress ?? null,
        legalCity: fields.legalCity ?? null,
        legalState: fields.legalState ?? null,
        legalCountry: fields.legalCountry ?? null,
        ...driveData,
      },
      select: studentResponseSelect,
    });
    await writeAudit({
      actorId: null,
      action: "integrations.n8n.operaciones_student.created",
      target: student.id,
      metadata: {
        ghlContactId: student.ghlContactId,
        driveFolderSynced: Boolean(fields.driveFolderId || fields.driveFolderUrl),
      },
    });
    return NextResponse.json({ created: true, student }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const studentResponseSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  ghlContactId: true,
  status: true,
  driveFolderUrl: true,
} satisfies Prisma.StudentSelect;

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Reúne candidatos por los tres criterios (ghlContactId, email, teléfono) y deja
// que pickStudentMatch decida en orden de prioridad. El teléfono se filtra por
// sus últimos 10 dígitos para tolerar prefijos +57/formato.
async function findMatchingStudentId(
  fields: ParsedFields,
): Promise<string | null> {
  const email = fields.email;
  const phone = normalizePhone(fields.phone);
  const ghl = fields.ghlContactId;

  const candidates: StudentMatchCandidate[] = [];
  const seen = new Set<string>();
  const push = (rows: StudentMatchCandidate[]) => {
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        candidates.push(row);
      }
    }
  };

  if (ghl) {
    push(
      await prisma.student.findMany({
        where: { ghlContactId: ghl },
        select: { id: true, ghlContactId: true, email: true, phone: true },
      }),
    );
  }
  if (email) {
    push(
      await prisma.student.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, ghlContactId: true, email: true, phone: true },
      }),
    );
  }
  if (phone) {
    push(
      await prisma.student.findMany({
        where: { phone: { contains: phone } },
        select: { id: true, ghlContactId: true, email: true, phone: true },
        take: 25,
      }),
    );
  }

  return pickStudentMatch(
    { ghlContactId: ghl, studentEmail: fields.email, studentPhone: fields.phone },
    candidates,
  );
}
