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
  buildEnrollmentScheduleRows,
  calculateEnrollmentBalance,
  canSellProductToStudent,
  deriveDefaultCommissionBaseFromInitialPayment,
} from "@/lib/operaciones-products";

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

    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: {
        id: true,
        name: true,
        isActive: true,
        saleLimit: true,
        allowsInstallments: true,
        requiresInitialPayment: true,
        generatesCommission: true,
        defaultCommissionPercent: true,
      },
    });
    if (!product) return jsonError(404, "Producto no encontrado");
    if (!product.isActive) return jsonError(400, "El producto no está activo");

    const initialPayment = body.initialPayment ?? null;
    if (product.requiresInitialPayment && !initialPayment) {
      return jsonError(
        400,
        "Este producto requiere un pago inicial",
      );
    }

    // Business rule: every initial payment must land in a known active
    // receiver account. We fall back to the enrollment-level account so the
    // caller can set it once and have the payment inherit it; the resolved id
    // is what we persist on Payment.paymentAccountId below.
    const initialPaymentAccountId = initialPayment
      ? (initialPayment.paymentAccountId ?? body.paymentAccountId ?? null)
      : null;
    if (initialPayment && !initialPaymentAccountId) {
      return jsonError(
        400,
        "El pago inicial requiere una cuenta receptora (paymentAccountId)",
      );
    }

    // Business rule: the dashboard balance is denominated in USD, so any
    // non-USD initial payment must carry an explicit officialAmountUsd > 0
    // for the FX-resolved value. Without it the enrollment balance would
    // silently underreport.
    if (
      initialPayment &&
      initialPayment.currency.toUpperCase() !== "USD" &&
      (initialPayment.officialAmountUsd == null ||
        Number(initialPayment.officialAmountUsd) <= 0)
    ) {
      return jsonError(
        400,
        "officialAmountUsd > 0 es obligatorio cuando initialPayment.currency no es USD",
      );
    }

    // Single round-trip to validate every referenced account (enrollment +
    // initial payment, de-duplicated when they coincide).
    const accountIdsToCheck = Array.from(
      new Set(
        [body.paymentAccountId ?? null, initialPaymentAccountId].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    );
    if (accountIdsToCheck.length > 0) {
      const accounts = await prisma.paymentAccount.findMany({
        where: { id: { in: accountIdsToCheck } },
        select: { id: true, isActive: true },
      });
      const byId = new Map(accounts.map((a) => [a.id, a]));
      for (const id of accountIdsToCheck) {
        const found = byId.get(id);
        if (!found) return jsonError(400, "La cuenta de pago no existe");
        if (!found.isActive)
          return jsonError(400, "La cuenta de pago no está activa");
      }
    }

    if (product.saleLimit === "ONE_PER_STUDENT") {
      const activeCount = await prisma.studentProductEnrollment.count({
        where: {
          studentId: id,
          productId: product.id,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
      });
      if (!canSellProductToStudent(product.saleLimit, activeCount)) {
        return jsonError(
          409,
          "El estudiante ya tiene un enrollment activo o pausado de este producto",
        );
      }
    }

    const initialPaymentUsd = initialPayment
      ? Number(
          initialPayment.officialAmountUsd ??
            (initialPayment.currency.toUpperCase() === "USD"
              ? initialPayment.amount
              : 0),
        )
      : 0;

    const totalAmountUsd = Number(body.totalAmountUsd);
    if (initialPaymentUsd - totalAmountUsd > 0.01) {
      return jsonError(
        400,
        "El pago inicial (USD) no puede exceder el monto total del enrollment",
      );
    }
    const balanceAfterInitial = Math.max(
      0,
      Math.round((totalAmountUsd - initialPaymentUsd) * 100) / 100,
    );

    // Saldo restante después del inicial obliga a definir un plan de cuotas; el
    // producto debe permitirlas y el caller debe enviar count + firstDueDate.
    // Si el saldo es 0 (inicial cubre el total) no se exige nada y tampoco se
    // crea schedule (buildEnrollmentScheduleRows devuelve []).
    if (balanceAfterInitial > 0) {
      if (!product.allowsInstallments) {
        return jsonError(
          400,
          "Este producto no permite cuotas; el pago inicial debe cubrir el monto total",
        );
      }
      if (!body.installmentCount || !body.firstDueDate) {
        return jsonError(
          400,
          "Con saldo restante > 0 se requieren installmentCount y firstDueDate",
        );
      }
    }

    const scheduleRows = buildEnrollmentScheduleRows({
      totalAmountUsd,
      initialPaymentUsd,
      installmentCount: body.installmentCount ?? null,
      firstDueDate: body.firstDueDate
        ? new Date(`${body.firstDueDate}T00:00:00.000Z`)
        : null,
      frequency: body.installmentFrequency,
    });

    const commissionBaseUsd = product.generatesCommission
      ? body.commissionBaseUsd != null
        ? Number(body.commissionBaseUsd)
        : deriveDefaultCommissionBaseFromInitialPayment(
            initialPayment
              ? {
                  isInitialPayment: true,
                  initialPaymentType: initialPayment.initialPaymentType,
                  officialAmountUsd: initialPayment.officialAmountUsd ?? null,
                  amount: initialPayment.amount,
                  currency: initialPayment.currency,
                }
              : null,
          )
      : null;

    const commissionPercent = product.generatesCommission
      ? body.commissionPercent != null
        ? Number(body.commissionPercent)
        : Number(product.defaultCommissionPercent)
      : null;

    const grantAccess = body.grantAccessNow === true;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.studentProductEnrollment.create({
        data: {
          studentId: id,
          productId: product.id,
          status: "ACTIVE",
          startedAt: new Date(`${body.startedAt}T00:00:00.000Z`),
          endsAt: body.endsAt
            ? new Date(`${body.endsAt}T00:00:00.000Z`)
            : null,
          totalAmountUsd,
          initialPaymentUsd: initialPayment ? initialPaymentUsd : null,
          balanceUsd: balanceAfterInitial,
          installmentCount: body.installmentCount ?? null,
          commissionBaseUsd,
          commissionPercent,
          currency: body.currency,
          paymentAccountId: body.paymentAccountId ?? null,
          accessStatus: grantAccess ? "ACTIVE" : "PENDING",
          accessGrantedAt: grantAccess ? now : null,
          learnWorldsSyncStatus: "pending",
          notes: body.notes ?? null,
        },
      });

      let createdPaymentId: string | null = null;
      if (initialPayment) {
        const paidAt = new Date(`${initialPayment.paidAt}T12:00:00.000Z`);
        const payment = await tx.payment.create({
          data: {
            studentId: id,
            enrollmentId: enrollment.id,
            paymentAccountId: initialPaymentAccountId,
            amount: initialPayment.amount,
            currency: initialPayment.currency,
            officialAmountUsd: initialPayment.officialAmountUsd ?? null,
            receivedAmount: initialPayment.receivedAmount ?? null,
            receivedCurrency: initialPayment.receivedCurrency ?? null,
            exchangeRate: initialPayment.exchangeRate ?? null,
            isInitialPayment: true,
            initialPaymentType: initialPayment.initialPaymentType,
            paidAt,
            method: initialPayment.method ?? null,
            reference: initialPayment.reference ?? null,
            notes: initialPayment.notes ?? null,
            recordedById: actor.userId,
          },
        });
        createdPaymentId = payment.id;
      }

      if (scheduleRows.length > 0) {
        await tx.paymentSchedule.createMany({
          data: scheduleRows.map((row) => ({
            studentId: id,
            enrollmentId: enrollment.id,
            installmentNumber: row.installmentNumber,
            amountDue: row.amountDue,
            currency: body.currency,
            dueDate: row.dueDate,
            status: "PENDING" as const,
          })),
        });
      }

      const payments = await tx.payment.findMany({
        where: { enrollmentId: enrollment.id },
        select: {
          amount: true,
          currency: true,
          officialAmountUsd: true,
        },
      });
      const balance = calculateEnrollmentBalance(
        totalAmountUsd,
        payments.map((p) => ({
          amount: p.amount.toString(),
          currency: p.currency,
          officialAmountUsd: p.officialAmountUsd?.toString() ?? null,
        })),
      );
      const updated = await tx.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: { balanceUsd: balance.balanceUsd },
        include: {
          product: true,
          paymentAccount: true,
          payments: { orderBy: { paidAt: "desc" } },
          paymentSchedules: { orderBy: { installmentNumber: "asc" } },
        },
      });

      return { enrollment: updated, createdPaymentId };
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.student_product_enrollment.create",
      target: result.enrollment.id,
      metadata: {
        studentId: id,
        productId: product.id,
        totalAmountUsd,
        initialPaymentUsd: initialPayment ? initialPaymentUsd : null,
        installmentCount: body.installmentCount ?? null,
        grantAccessNow: grantAccess,
        paymentId: result.createdPaymentId,
      },
    });

    return NextResponse.json({ enrollment: result.enrollment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
