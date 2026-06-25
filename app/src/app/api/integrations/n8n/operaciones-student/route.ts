import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  normalizePhone,
  pickStudentMatch,
  type StudentMatchCandidate,
} from "@/lib/operaciones-signature-flow";
import {
  buildN8nStudentCreateData,
  buildN8nStudentUpdateData,
  parseN8nStudentFields,
  type N8nParsedFields,
} from "@/lib/n8n-operaciones-student";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// n8n (disparado por GHL) crea/actualiza una ficha MÍNIMA del estudiante en
// Torre: nombre, correo, teléfono y, si ya existe, ghlContactId / carpeta Drive.
// Autenticado solo por el secreto compartido N8N_TORRE_WEBHOOK_SECRET (header
// x-n8n-webhook-secret / x-webhook-secret / Authorization Bearer); el secreto se
// compara con timingSafeEqual y jamás se loguea. Este endpoint NO crea
// inscripción, pago, contrato ni acceso a LearnWorlds, y NO normaliza
// producto/programa/duración/estado/legal aunque el payload los traiga: la ficha
// queda como "pendiente de completar" (status INACTIVE + durationAssumed) hasta
// que un operador la diligencia en Torre. Toda la lógica de parseo/armado de
// datos vive en @/lib/n8n-operaciones-student para poder testearla sin red.

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
    const fields = parseN8nStudentFields(raw as Record<string, unknown>);

    const matchedId = await findMatchingStudentId(fields);

    if (matchedId) {
      const existing = await prisma.student.findUnique({
        where: { id: matchedId },
        select: { id: true },
      });
      if (!existing) {
        // Carrera improbable: el estudiante desapareció entre el match y el
        // update. Tratamos como no encontrado para no romper.
        return jsonError(409, "El estudiante coincidente ya no existe");
      }

      const student = await prisma.student.update({
        where: { id: matchedId },
        data: buildN8nStudentUpdateData(fields),
        select: studentResponseSelect,
      });
      await writeAudit({
        actorId: null,
        action: "integrations.n8n.operaciones_student.updated",
        target: student.id,
        metadata: {
          ghlContactId: student.ghlContactId,
          driveFolderSynced: Boolean(
            fields.driveFolderId || fields.driveFolderUrl,
          ),
        },
      });
      return NextResponse.json({ created: false, student });
    }

    // No existe: creamos una ficha mínima pendiente. Email es obligatorio para
    // crear (es la clave única); fullName se deriva si no vino explícito.
    if (!fields.email) {
      return jsonError(400, "email requerido para crear un estudiante nuevo");
    }

    const student = await prisma.student.create({
      data: buildN8nStudentCreateData(fields),
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

// Reúne candidatos por los tres criterios (ghlContactId, email, teléfono) y deja
// que pickStudentMatch decida en orden de prioridad. El teléfono se filtra por
// sus últimos 10 dígitos para tolerar prefijos +57/formato.
async function findMatchingStudentId(
  fields: N8nParsedFields,
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
