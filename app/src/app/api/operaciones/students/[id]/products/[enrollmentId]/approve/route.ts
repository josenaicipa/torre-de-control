import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { enrollEnrollmentInLearnWorlds } from "@/lib/lw-client";
import { COMPANY } from "@/lib/operaciones-contract-template";
import {
  computeCeoSignatureHash,
  contractEnrollmentSelect,
  findMissingContractFields,
  validateSignatureImage,
} from "@/lib/operaciones-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

// Aprueba el contrato desde Torre: registra la firma del CEO (Jose David
// Naicipa Jiménez) y libera el acceso en LearnWorlds. Solo aprueba contratos
// realmente FIRMADOS con evidencia de firma electrónica del estudiante (hash y
// fecha) y con todos los datos legales/comerciales completos.
export async function POST(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, enrollmentId } = await params;

    // La firma manuscrita de Jose Naicipa es obligatoria para aprobar: se sube
    // como data URL PNG/JPEG (máx. 1 MB) y se guarda para estamparla en el PDF.
    let body: unknown;
    try {
      body = await _req.json();
    } catch {
      body = null;
    }
    const signatureImageValue =
      body && typeof body === "object"
        ? (body as { signatureImage?: unknown }).signatureImage
        : undefined;
    if (signatureImageValue === undefined || signatureImageValue === null) {
      return jsonError(
        400,
        "Sube la firma de Jose Naicipa en PNG o JPG antes de aprobar el contrato",
      );
    }
    const signatureImage = validateSignatureImage(signatureImageValue);
    if (!signatureImage.ok) {
      return jsonError(400, signatureImage.error);
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, mentorUserId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    const enrollment = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        ...contractEnrollmentSelect,
        studentId: true,
        installmentCount: true,
        product: {
          select: { id: true, name: true, requiresInitialPayment: true },
        },
        payments: { select: { isInitialPayment: true } },
        _count: { select: { paymentSchedules: true } },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    if (enrollment.contractStatus !== "SIGNED") {
      return jsonError(
        400,
        "El contrato debe estar firmado por el estudiante para poder aprobarlo y liberar acceso",
      );
    }

    // No aprobar un contrato con datos legales/comerciales incompletos: los
    // datos pudieron cambiar desde que se firmó.
    const missingFields = findMissingContractFields(enrollment);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error:
            "El contrato tiene datos incompletos y no puede aprobarse. Completa los datos y regenera la firma.",
          missingFields,
        },
        { status: 400 },
      );
    }

    if (!enrollment.contractStudentSignatureHash || !enrollment.contractSignedAt) {
      return jsonError(
        400,
        "Falta la evidencia de firma electrónica del estudiante; no se puede aprobar",
      );
    }

    if (
      enrollment.product.requiresInitialPayment &&
      !enrollment.payments.some((p) => p.isInitialPayment)
    ) {
      return jsonError(
        400,
        "Este producto requiere un pago inicial registrado antes de aprobar el contrato",
      );
    }

    const balanceUsd = Number(enrollment.balanceUsd ?? 0);
    const installmentCount = enrollment.installmentCount ?? 0;
    if (
      balanceUsd > 0 &&
      installmentCount > 0 &&
      enrollment._count.paymentSchedules === 0
    ) {
      return jsonError(
        400,
        "El saldo financiado requiere un plan de cuotas antes de aprobar el contrato",
      );
    }

    const now = new Date();
    const ceoName = COMPANY.ceoName;
    const ceoHash = computeCeoSignatureHash(
      enrollment.contractStudentSignatureHash,
      ceoName,
      now,
    );

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "APPROVED",
        contractApprovedAt: now,
        contractApprovedById: actor.userId,
        contractCeoSignerName: ceoName,
        contractCeoSignedAt: now,
        contractCeoSignedById: actor.userId,
        contractCeoSignatureHash: ceoHash,
        contractCeoSignatureImage: signatureImage.dataUrl,
        contractRejectedAt: null,
        contractRejectionReason: null,
      },
    });

    const lwResult = await enrollEnrollmentInLearnWorlds(enrollment.id);

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.approve_contract",
      target: enrollment.id,
      metadata: {
        studentId: id,
        productId: enrollment.product.id,
        accessStatus: lwResult.accessStatus,
        learnWorldsSyncStatus: lwResult.syncStatus,
        learnWorldsConfigCount: lwResult.configCount,
        learnWorldsError: lwResult.error,
      },
    });

    const updated = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollment.id },
      include: {
        product: {
          include: {
            learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
          },
        },
        paymentAccount: true,
        payments: { orderBy: { paidAt: "desc" } },
        paymentSchedules: { orderBy: { installmentNumber: "asc" } },
      },
    });

    return NextResponse.json({ enrollment: updated, learnWorlds: lwResult });
  } catch (err) {
    return handleApiError(err);
  }
}
