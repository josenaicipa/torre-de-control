import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
  requireAdmin,
  ForbiddenError,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  updateStudentSchema,
  updateStudentMemberSchema,
  isHardDeleteConfirmed,
} from "@/lib/operaciones-validations";
import { calculateEndDate } from "@/domain/students";
import {
  buildContractLinkResetData,
  canChangeContractTemplateKind,
} from "@/lib/operaciones-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params { params: Promise<{ id: string }> }

// Campos de Student que se interpolan en el contenido legal del contrato (o en
// la evidencia de firma). Si cambia cualquiera de ellos mientras hay un contrato
// con link/snapshot pendiente, ese link queda obsoleto y debe invalidarse para
// forzar la regeneración con los datos nuevos.
const LEGAL_CONTRACT_FIELDS = [
  "legalName",
  "documentType",
  "documentNumber",
  "legalAddress",
  "legalCity",
  "legalState",
  "legalCountry",
  "companyLegalName",
  "companyDocumentType",
  "companyDocumentNumber",
  "companyRepresentativeName",
  "fullName",
  "email",
  "phone",
] as const;

type LegalContractField = (typeof LEGAL_CONTRACT_FIELDS)[number];

// Normaliza un valor legal a string comparable: null/undefined → "" y strings
// recortados, para que un null↔"" o un cambio solo de espacios no dispare un
// reset falso del link de contrato.
function normalizeLegalValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

// Una fila de integrante se considera vacía cuando el operador la dejó sin
// ningún dato (típico de un "+ Agregar miembro" no rellenado). Esas filas se
// descartan antes de validar para no exigir fullName en filas que el usuario
// nunca completó.
function isEmptyMemberRow(row: unknown): boolean {
  if (!row || typeof row !== "object") return true;
  const r = row as Record<string, unknown>;
  return (
    isBlank(r.fullName) &&
    isBlank(r.email) &&
    isBlank(r.phone) &&
    isBlank(r.documentType) &&
    isBlank(r.documentNumber)
  );
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        mentorUser: { select: { id: true, name: true, email: true } },
        closerUser: { select: { id: true, name: true, email: true } },
        members: true,
        _count: {
          select: {
            paymentSchedules: true,
            payments: true,
            progressUpdates: true,
            monthlyMetrics: true,
            sales: true,
          },
        },
      },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }
    return NextResponse.json({ student });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await params;

    const existing = await prisma.student.findUnique({
      where: { id },
      select: {
        mentorUserId: true,
        startDate: true,
        durationMonths: true,
        legalName: true,
        documentType: true,
        documentNumber: true,
        legalAddress: true,
        legalCity: true,
        legalState: true,
        legalCountry: true,
        companyLegalName: true,
        companyDocumentType: true,
        companyDocumentNumber: true,
        companyRepresentativeName: true,
        fullName: true,
        email: true,
        phone: true,
        enrollments: {
          select: {
            id: true,
            contractStatus: true,
            contractSignedAt: true,
            contractCeoSignedAt: true,
            contractApprovedAt: true,
            contractSignatureToken: true,
            contractUrl: true,
            contractSectionsSnapshot: true,
          },
        },
      },
    });
    if (!existing) return jsonError(404, "Estudiante no encontrado");

    const rawBody = (await req.json()) as Record<string, unknown>;
    const body = updateStudentSchema.parse(rawBody);

    // ¿El PATCH cambia algún dato legal que se congeló en un contrato pendiente?
    // Se compara el valor entrante (solo campos presentes en el body) contra el
    // guardado, normalizando null/undefined/espacios para no disparar resets
    // falsos.
    const legalContractFieldsChanged = LEGAL_CONTRACT_FIELDS.filter((field) => {
      if (!(field in body)) return false;
      return (
        normalizeLegalValue((body as Record<string, unknown>)[field]) !==
        normalizeLegalValue(existing[field as LegalContractField])
      );
    });

    // Inscripciones cuyo link/snapshot de contrato quedaría obsoleto: solo las
    // que aún pueden regenerarse (sin firma de ninguna parte) Y que tienen un
    // link/snapshot pendiente que congeló los datos legales anteriores.
    const enrollmentsToReset =
      legalContractFieldsChanged.length > 0
        ? existing.enrollments.filter(
            (e) =>
              canChangeContractTemplateKind(e) &&
              (Boolean(e.contractSignatureToken) ||
                Boolean(e.contractUrl) ||
                Boolean(e.contractSectionsSnapshot) ||
                e.contractStatus === "PENDING_SIGNATURE" ||
                e.contractStatus === "REJECTED"),
          )
        : [];

    // Los integrantes del equipo no son una columna de Student: se extraen del
    // body crudo y se reemplazan aparte dentro de la transacción. Si el campo
    // no viene, la lista de miembros se deja intacta.
    const hasMembers = Array.isArray(rawBody.members);
    const memberCreates = hasMembers
      ? (rawBody.members as unknown[])
          .filter((row) => !isEmptyMemberRow(row))
          .map((row, index) => {
            const member = updateStudentMemberSchema.parse(row);
            return {
              fullName: member.fullName,
              email: member.email ?? null,
              phone: member.phone ?? null,
              documentType: member.documentType ?? null,
              documentNumber: member.documentNumber ?? null,
              isContractSigner: member.isContractSigner,
              isPrimaryContact: index === 0,
            };
          })
      : [];

    if (body.closerUserId) {
      const closer = await prisma.user.findFirst({
        where: {
          id: body.closerUserId,
          active: true,
          OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
        },
        select: { id: true },
      });
      if (!closer) return jsonError(400, "El closer seleccionado no es válido");
    }

    // Recalcular endDate si cambia startDate o durationMonths
    let computedEndDate: Date | undefined;
    if (body.startDate || body.durationMonths) {
      const newStartDate = body.startDate
        ? new Date(body.startDate + "T00:00:00.000Z")
        : existing.startDate;
      const newDuration = body.durationMonths ?? existing.durationMonths;
      computedEndDate = calculateEndDate(newStartDate, newDuration);
    }

    const data: Record<string, unknown> = { ...body };
    if (body.startDate) data.startDate = new Date(body.startDate + "T00:00:00.000Z");
    if (computedEndDate) data.endDate = computedEndDate;

    const student = await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id }, data: data as never });

      if (hasMembers) {
        await tx.studentMember.deleteMany({ where: { studentId: id } });
        if (memberCreates.length > 0) {
          await tx.studentMember.createMany({
            data: memberCreates.map((m) => ({ ...m, studentId: id })),
          });
        }
      }

      // Los datos legales cambiaron: invalida los links/snapshots pendientes que
      // los habían congelado, dejando esas inscripciones en DRAFT para regenerar
      // el contrato con los datos nuevos. No toca contratos firmados/aprobados.
      if (enrollmentsToReset.length > 0) {
        await tx.studentProductEnrollment.updateMany({
          where: { id: { in: enrollmentsToReset.map((e) => e.id) } },
          data: buildContractLinkResetData(),
        });
      }

      return tx.student.findUniqueOrThrow({
        where: { id },
        include: {
          mentorUser: { select: { id: true, name: true, email: true } },
          closerUser: { select: { id: true, name: true, email: true } },
          members: true,
        },
      });
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.update",
      target: id,
      metadata: {
        ...(body as Record<string, unknown>),
        ...(legalContractFieldsChanged.length > 0
          ? {
              legalContractFieldsChanged: [...legalContractFieldsChanged],
              resetContractLinks: enrollmentsToReset.length,
            }
          : {}),
      },
    });

    return NextResponse.json({ student });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);
    const { id } = await params;

    const url = new URL(req.url);
    const isHardDelete = url.searchParams.get("hard") === "true";

    if (!isHardDelete) {
      const existing = await prisma.student.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) return jsonError(404, "Estudiante no encontrado");

      const student = await prisma.student.update({
        where: { id },
        data: { status: "DROPPED" },
      });

      await writeAudit({
        actorId: actor.userId,
        action: "student.soft_delete",
        target: id,
      });

      return NextResponse.json({ student });
    }

    // Hard delete: eliminación definitiva del estudiante de prueba y toda su
    // data operativa asociada (cascadas Prisma). Requiere confirmación exacta.
    let confirmation: unknown;
    try {
      const body = await req.json();
      confirmation = (body as { confirmation?: unknown })?.confirmation;
    } catch {
      confirmation = undefined;
    }

    if (!isHardDeleteConfirmed(confirmation)) {
      return jsonError(
        400,
        'Para eliminar definitivamente debes confirmar escribiendo exactamente "ELIMINAR".',
      );
    }

    const existing = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        _count: {
          select: {
            paymentSchedules: true,
            payments: true,
            progressUpdates: true,
            monthlyMetrics: true,
            sales: true,
            enrollments: true,
            members: true,
          },
        },
      },
    });
    if (!existing) return jsonError(404, "Estudiante no encontrado");

    await prisma.student.delete({ where: { id } });

    await writeAudit({
      actorId: actor.userId,
      action: "student.hard_delete",
      target: id,
      metadata: {
        fullName: existing.fullName,
        email: existing.email,
        counts: existing._count,
      },
    });

    return NextResponse.json({ ok: true, deleted: id });
  } catch (err) {
    return handleApiError(err);
  }
}
