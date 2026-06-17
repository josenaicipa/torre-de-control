import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { mergeStudentScope } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  createStudentWithInitialEnrollmentSchema,
  listStudentsQuerySchema,
} from "@/lib/operaciones-validations";
import {
  EnrollmentValidationError,
  createValidatedEnrollmentInTx,
  prepareEnrollmentCreate,
} from "@/lib/operaciones-enrollments";
import { calculateEndDate } from "@/domain/students";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { searchParams } = new URL(req.url);
    const query = listStudentsQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const where: Record<string, unknown> = {};
    if (query.mentorUserId) where.mentorUserId = query.mentorUserId;
    if (query.closerUserId) where.closerUserId = query.closerUserId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const scoped = mergeStudentScope(actor, where);

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where: scoped as never,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          mentorUser: { select: { id: true, name: true, email: true } },
          closerUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.student.count({ where: scoped as never }),
    ]);

    return NextResponse.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    // Schema includes the optional initialEnrollment block; omitting it
    // preserves the legacy "create student only" payload shape.
    const body = createStudentWithInitialEnrollmentSchema.parse(await req.json());

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

    const initialEnrollment = body.initialEnrollment ?? null;

    // Pre-validate the enrollment payload *before* opening the transaction so
    // a bad product / account / installment plan fails fast without leaving a
    // half-created student row. The student is brand new here, so the
    // sale-limit check is trivially satisfied — we skip it (count would be 0).
    const validatedEnrollment = initialEnrollment
      ? await prepareEnrollmentCreate(prisma, initialEnrollment)
      : null;

    const startDate = new Date(body.startDate + "T00:00:00.000Z");
    const endDate = calculateEndDate(startDate, body.durationMonths);

    const studentData = {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      startDate,
      durationMonths: body.durationMonths,
      endDate,
      mentorUserId: body.mentorUserId ?? null,
      closerUserId: body.closerUserId ?? null,
      ghlContactId: body.ghlContactId ?? null,
      notes: body.notes ?? null,
      personality: body.personality ?? null,
      legalName: body.legalName ?? null,
      documentType: body.documentType ?? null,
      documentNumber: body.documentNumber ?? null,
      legalAddress: body.legalAddress ?? null,
      legalCity: body.legalCity ?? null,
      legalState: body.legalState ?? null,
      legalCountry: body.legalCountry ?? null,
    };
    const studentInclude = {
      mentorUser: { select: { id: true, name: true, email: true } },
      closerUser: { select: { id: true, name: true, email: true } },
    } as const;

    const { student, enrollment, createdPaymentId } = await prisma.$transaction(
      async (tx) => {
        const created = await tx.student.create({
          data: studentData,
          include: studentInclude,
        });

        if (!initialEnrollment || !validatedEnrollment) {
          return {
            student: created,
            enrollment: null as
              | Awaited<ReturnType<typeof createValidatedEnrollmentInTx>>["enrollment"]
              | null,
            createdPaymentId: null as string | null,
          };
        }

        const result = await createValidatedEnrollmentInTx({
          tx,
          studentId: created.id,
          actorUserId: actor.userId,
          body: initialEnrollment,
          validated: validatedEnrollment,
        });
        return {
          student: created,
          enrollment: result.enrollment,
          createdPaymentId: result.createdPaymentId,
        };
      },
    );

    await writeAudit({
      actorId: actor.userId,
      action: "student.create",
      target: student.id,
      metadata: {
        email: student.email,
        mentorUserId: student.mentorUserId,
        closerUserId: student.closerUserId,
        withInitialEnrollment: Boolean(enrollment),
      },
    });

    if (enrollment && validatedEnrollment && initialEnrollment) {
      await writeAudit({
        actorId: actor.userId,
        action: "operaciones.student_product_enrollment.create",
        target: enrollment.id,
        metadata: {
          studentId: student.id,
          productId: validatedEnrollment.product.id,
          totalAmountUsd: validatedEnrollment.totalAmountUsd,
          initialPaymentUsd: validatedEnrollment.initialPayment
            ? validatedEnrollment.initialPaymentUsd
            : null,
          installmentCount: initialEnrollment.installmentCount ?? null,
          grantAccessNow: validatedEnrollment.grantAccess,
          paymentId: createdPaymentId,
          createdWithStudent: true,
        },
      });
    }

    return NextResponse.json(
      enrollment ? { student, enrollment } : { student },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof EnrollmentValidationError) {
      return jsonError(err.status, err.message);
    }
    return handleApiError(err);
  }
}
