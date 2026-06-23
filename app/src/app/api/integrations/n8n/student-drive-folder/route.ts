import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  normalizeEmail,
  normalizePhone,
  pickStudentMatch,
  type StudentMatchCandidate,
} from "@/lib/operaciones-signature-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// n8n (disparado por GHL) crea la carpeta Drive del estudiante y la informa
// aquí. Autenticado solo por secreto compartido N8N_TORRE_WEBHOOK_SECRET; nunca
// se confía en el payload sin validar el secreto. El secreto se compara con
// timingSafeEqual y jamás se loguea.
const payloadSchema = z.object({
  studentEmail: z.string().trim().email().optional().nullable(),
  studentPhone: z.string().trim().max(50).optional().nullable(),
  ghlContactId: z.string().trim().max(100).optional().nullable(),
  driveFolderId: z.string().trim().min(1, "driveFolderId requerido").max(200),
  driveFolderUrl: z.string().trim().url().max(500).optional().nullable(),
});

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
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, "Payload inválido", parsed.error.flatten());
    }
    const payload = parsed.data;

    const matchedStudentId = await findMatchingStudentId(payload);

    if (!matchedStudentId) {
      // Aún no existe el estudiante: guardamos el evento para reconciliar cuando
      // se cree o cuando un dato coincida.
      const pending = await prisma.pendingDriveFolderEvent.create({
        data: {
          studentEmail: normalizeEmail(payload.studentEmail),
          studentPhone: normalizePhone(payload.studentPhone),
          ghlContactId: payload.ghlContactId?.trim() || null,
          driveFolderId: payload.driveFolderId,
          driveFolderUrl: payload.driveFolderUrl ?? null,
          rawPayload: payload,
        },
      });
      await writeAudit({
        actorId: null,
        action: "integrations.n8n.student_drive_folder.pending",
        target: pending.id,
        metadata: { driveFolderId: payload.driveFolderId, matched: false },
      });
      return NextResponse.json({ matched: false, pendingEventId: pending.id }, { status: 202 });
    }

    await prisma.student.update({
      where: { id: matchedStudentId },
      data: {
        driveFolderId: payload.driveFolderId,
        driveFolderUrl: payload.driveFolderUrl ?? null,
        driveFolderSource: "n8n_ghl_webhook",
        driveFolderSyncedAt: new Date(),
        driveFolderSyncStatus: "synced",
        driveFolderSyncError: null,
      },
    });
    await writeAudit({
      actorId: null,
      action: "integrations.n8n.student_drive_folder.synced",
      target: matchedStudentId,
      metadata: { driveFolderId: payload.driveFolderId, matched: true },
    });

    return NextResponse.json({ matched: true, studentId: matchedStudentId });
  } catch (err) {
    return handleApiError(err);
  }
}

// Reúne candidatos por los tres criterios (ghlContactId, email, teléfono) y deja
// que pickStudentMatch decida en orden de prioridad. El teléfono se filtra por
// sus últimos 10 dígitos para tolerar prefijos +57/formato.
async function findMatchingStudentId(
  payload: z.infer<typeof payloadSchema>,
): Promise<string | null> {
  const email = normalizeEmail(payload.studentEmail);
  const phone = normalizePhone(payload.studentPhone);
  const ghl = payload.ghlContactId?.trim() || null;

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
    { ghlContactId: ghl, studentEmail: payload.studentEmail, studentPhone: payload.studentPhone },
    candidates,
  );
}
