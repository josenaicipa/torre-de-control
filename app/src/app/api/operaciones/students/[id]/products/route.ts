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
import { createStudentProductEnrollmentSchema } from "@/lib/operaciones-validations";
import {
  EnrollmentValidationError,
  createValidatedEnrollmentInTx,
  prepareEnrollmentCreate,
} from "@/lib/operaciones-enrollments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: { mentorUserId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    const enrollments = await prisma.studentProductEnrollment.findMany({
      where: { studentId: id },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
          },
        },
        paymentAccount: true,
        payments: {
          orderBy: { paidAt: "desc" },
        },
        paymentSchedules: {
          orderBy: { installmentNumber: "asc" },
        },
        referralCommissions: {
          include: {
            referral: {
              include: {
                referrerStudent: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ enrollments });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await params;

    const body = createStudentProductEnrollmentSchema.parse(await req.json());
    if (body.studentId !== id) {
      return jsonError(400, "studentId del body no coincide con la URL");
    }

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, mentorUserId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");

    const { studentId: _studentId, ...enrollmentBody } = body;
    const validated = await prepareEnrollmentCreate(prisma, enrollmentBody, {
      enforceSaleLimitForStudentId: id,
    });

    const result = await prisma.$transaction((tx) =>
      createValidatedEnrollmentInTx({
        tx,
        studentId: id,
        actorUserId: actor.userId,
        body: enrollmentBody,
        validated,
      }),
    );

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.create",
      target: result.enrollment.id,
      metadata: {
        studentId: id,
        productId: validated.product.id,
        totalAmountUsd: validated.totalAmountUsd,
        initialPaymentUsd: validated.initialPayment
          ? validated.initialPaymentUsd
          : null,
        installmentCount: enrollmentBody.installmentCount ?? null,
        grantAccessNow: validated.grantAccess,
        paymentId: result.createdPaymentId,
      },
    });

    return NextResponse.json({ enrollment: result.enrollment }, { status: 201 });
  } catch (err) {
    if (err instanceof EnrollmentValidationError) {
      return jsonError(err.status, err.message);
    }
    return handleApiError(err);
  }
}
