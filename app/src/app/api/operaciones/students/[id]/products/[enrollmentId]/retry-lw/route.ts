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
import { grantLearnWorldsAccessViaN8n } from "@/lib/n8n-operaciones-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; enrollmentId: string }>;
}

const ENROLLMENT_INCLUDE = {
  product: {
    include: {
      learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
    },
  },
  paymentAccount: true,
  payments: { orderBy: { paidAt: "desc" } },
  paymentSchedules: { orderBy: { installmentNumber: "asc" } },
} as const;

export async function POST(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id, enrollmentId } = await params;

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
        id: true,
        studentId: true,
        contractStatus: true,
        accessStatus: true,
        student: { select: { email: true, fullName: true, legalName: true } },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            programLevel: true,
            learnWorldsAccessConfigs: {
              where: { isActive: true },
              select: {
                lwProductType: true,
                lwExternalId: true,
                lwDisplayName: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
    if (!enrollment || enrollment.studentId !== id) {
      return jsonError(404, "Inscripción no encontrada para este estudiante");
    }

    // Idempotente: si el acceso ya está ACTIVE no volvemos a llamar a n8n; la UI
    // solo necesita el enrollment fresco.
    if (enrollment.accessStatus === "ACTIVE") {
      const current = await prisma.studentProductEnrollment.findUnique({
        where: { id: enrollment.id },
        include: ENROLLMENT_INCLUDE,
      });
      return NextResponse.json({
        enrollment: current,
        learnWorlds: { ok: true, accessStatus: "ACTIVE", alreadyActive: true },
      });
    }

    if (
      enrollment.contractStatus !== "APPROVED" &&
      enrollment.accessStatus !== "SYNC_ERROR"
    ) {
      return jsonError(
        400,
        "Solo se puede reintentar la sincronización con LearnWorlds si el contrato está aprobado o el acceso quedó en error",
      );
    }

    const accessConfigs = enrollment.product.learnWorldsAccessConfigs;
    const courses = accessConfigs.map((config) => ({
      productId: config.lwExternalId,
      productType: config.lwProductType.toLowerCase(),
      displayName: config.lwDisplayName,
    }));
    const studentName =
      enrollment.student.legalName?.trim() ||
      enrollment.student.fullName ||
      "Estudiante";

    const result = await grantLearnWorldsAccessViaN8n({
      studentId: id,
      enrollmentId: enrollment.id,
      studentEmail: enrollment.student.email,
      email: enrollment.student.email,
      studentName,
      fullName: enrollment.student.fullName,
      legalName: enrollment.student.legalName,
      product: {
        id: enrollment.product.id,
        name: enrollment.product.name,
        slug: enrollment.product.slug,
        programLevel: enrollment.product.programLevel,
      },
      accessConfigs,
      courses,
      contractStatus: enrollment.contractStatus,
      requestedAt: new Date().toISOString(),
    });

    if (!result.ok) {
      const error = result.error.slice(0, 500);
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          accessStatus: "SYNC_ERROR",
          learnWorldsSyncStatus: "error",
          learnWorldsSyncError: error,
        },
      });
      await writeAudit({
        actorId: actor.userId,
        action: "operaciones.student_product_enrollment.grant_lw_access",
        target: enrollment.id,
        metadata: {
          studentId: id,
          productId: enrollment.product.id,
          accessStatus: "SYNC_ERROR",
          learnWorldsSyncStatus: "error",
          learnWorldsConfigCount: accessConfigs.length,
          learnWorldsError: error,
        },
      });
      const updated = await prisma.studentProductEnrollment.findUnique({
        where: { id: enrollment.id },
        include: ENROLLMENT_INCLUDE,
      });
      return NextResponse.json(
        {
          enrollment: updated,
          learnWorlds: { ok: false, accessStatus: "SYNC_ERROR", error },
        },
        { status: 502 },
      );
    }

    const now = new Date();
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "ACTIVE",
        accessGrantedAt: now,
        learnWorldsSyncStatus: "ok",
        learnWorldsSyncError: null,
      },
    });
    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.retry_lw",
      target: enrollment.id,
      metadata: {
        studentId: id,
        productId: enrollment.product.id,
        accessStatus: "ACTIVE",
        learnWorldsSyncStatus: "ok",
        learnWorldsConfigCount: accessConfigs.length,
      },
    });

    const updated = await prisma.studentProductEnrollment.findUnique({
      where: { id: enrollment.id },
      include: ENROLLMENT_INCLUDE,
    });

    return NextResponse.json({
      enrollment: updated,
      learnWorlds: { ok: true, accessStatus: "ACTIVE" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
