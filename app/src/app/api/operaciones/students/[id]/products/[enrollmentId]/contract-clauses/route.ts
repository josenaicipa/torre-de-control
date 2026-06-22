import { NextResponse } from "next/server";
import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  buildContractInputFromData,
  contractEnrollmentSelect,
  parseContractSectionsSnapshot,
  parseManualClausesSnapshot,
  serializeContractSectionsSnapshot,
  serializeManualClausesSnapshot,
} from "@/lib/operaciones-contract";
import { buildContractView } from "@/lib/operaciones-contract-template";
import {
  validateContractSectionsInput,
  validateManualClausesInput,
} from "@/lib/operaciones-manual-clauses";
import { getManualContractClauses } from "@/lib/operaciones-settings";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

const LOCKED_CONTRACT_STATUSES = new Set([
  "SIGNED",
  "PENDING_APPROVAL",
  "APPROVED",
]);

const LOCKED_MESSAGE =
  "El contrato firmado no se puede modificar. Debes regenerar o emitir otro contrato para cambiar sus cláusulas.";

function isEnrollmentContractEditable(enrollment: {
  contractStatus: string;
  contractSignedAt: Date | string | null;
}): boolean {
  if (LOCKED_CONTRACT_STATUSES.has(enrollment.contractStatus)) return false;
  if (enrollment.contractSignedAt) return false;
  return true;
}

async function getAuthorizedEnrollment(id: string, enrollmentId: string) {
  const actor = await getActor();
  requireActor(actor);
  requireOperatorOrAdmin(actor);

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, mentorUserId: true },
  });
  if (!student) return { actor, error: jsonError(404, "Estudiante no encontrado") };
  if (!canAccessStudent(actor, student.mentorUserId)) {
    throw new ForbiddenError("Sin acceso a este estudiante");
  }

  const enrollment = await prisma.studentProductEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { ...contractEnrollmentSelect, studentId: true },
  });
  if (!enrollment || enrollment.studentId !== id) {
    return {
      actor,
      error: jsonError(404, "Inscripción no encontrada para este estudiante"),
    };
  }

  return { actor, enrollment };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id, enrollmentId } = await params;
    const result = await getAuthorizedEnrollment(id, enrollmentId);
    if ("error" in result) return result.error;
    const { enrollment } = result;

    // Cláusulas manuales (compatibilidad): snapshot del enrollment o, si nunca
    // se tomó, la configuración global vigente.
    const snapshotClauses = parseManualClausesSnapshot(
      enrollment.contractManualClausesSnapshot,
    );
    const hasSpecificClauses = snapshotClauses !== null;
    const clauses = hasSpecificClauses
      ? snapshotClauses
      : (await getManualContractClauses())?.clauses ?? [];

    // Secciones del contrato COMPLETO. Si la inscripción ya tiene un snapshot
    // personalizado se devuelve tal cual; si no, se devuelven las secciones de
    // la plantilla oficial (con las cláusulas manuales anexadas) como punto de
    // partida editable.
    const snapshotSections = parseContractSectionsSnapshot(
      enrollment.contractSectionsSnapshot,
    );
    const hasSpecificSections =
      snapshotSections !== null && snapshotSections.length > 0;
    const sections = hasSpecificSections
      ? snapshotSections
      : buildContractView(
          buildContractInputFromData(
            enrollment,
            enrollment.contractSignedAt,
            clauses,
          ),
        ).sections;

    const editable = isEnrollmentContractEditable(enrollment);

    return NextResponse.json({
      clauses,
      source: hasSpecificClauses ? "enrollment" : "global",
      sections,
      sectionsSource: hasSpecificSections ? "enrollment" : "template",
      editable,
      lockedReason: editable ? null : LOCKED_MESSAGE,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { id, enrollmentId } = await params;
    const result = await getAuthorizedEnrollment(id, enrollmentId);
    if ("error" in result) return result.error;

    if (!isEnrollmentContractEditable(result.enrollment)) {
      return jsonError(400, LOCKED_MESSAGE);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const record =
      body && typeof body === "object"
        ? (body as { clauses?: unknown; sections?: unknown })
        : {};

    // Modo nuevo: editar el contrato COMPLETO por secciones. Tiene prioridad si
    // el body trae `sections`; congela el snapshot del contrato en la inscripción.
    if (record.sections !== undefined) {
      const validated = validateContractSectionsInput(record.sections);
      if (!validated.ok) return jsonError(400, validated.error);

      const snapshot = serializeContractSectionsSnapshot(validated.sections);
      await prisma.studentProductEnrollment.update({
        where: { id: result.enrollment.id },
        data: { contractSectionsSnapshot: snapshot },
      });

      await writeAudit({
        actorId: result.actor.userId,
        action: "operaciones.student_product_enrollment.update_contract_sections",
        target: result.enrollment.id,
        metadata: { studentId: id, count: validated.sections.length },
      });

      return NextResponse.json({
        ok: true,
        sections: validated.sections,
        sectionsSource: "enrollment",
        editable: true,
      });
    }

    // Modo de compatibilidad: editar solo las cláusulas manuales anexas.
    const validated = validateManualClausesInput(record.clauses);
    if (!validated.ok) return jsonError(400, validated.error);

    const snapshot = serializeManualClausesSnapshot(validated.clauses);
    await prisma.studentProductEnrollment.update({
      where: { id: result.enrollment.id },
      data: { contractManualClausesSnapshot: snapshot },
    });

    await writeAudit({
      actorId: result.actor.userId,
      action: "operaciones.student_product_enrollment.update_contract_clauses",
      target: result.enrollment.id,
      metadata: { studentId: id, count: validated.clauses.length },
    });

    return NextResponse.json({
      ok: true,
      clauses: validated.clauses,
      source: "enrollment",
      editable: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
