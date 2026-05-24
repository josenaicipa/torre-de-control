import { deriveScheduleStatus } from "@/domain/payments";
import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { createPaymentSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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

    const payments = await prisma.payment.findMany({
      where: { studentId: id },
      orderBy: { paidAt: "desc" },
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        schedule: { select: { id: true, installmentNumber: true } },
      },
    });
    return NextResponse.json({ payments });
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

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");

    const body = createPaymentSchema.parse(await req.json());

    const paidAt = new Date(`${body.paidAt}T12:00:00.000Z`);

    const result = await prisma.$transaction(async (tx) => {
      const schedule = body.scheduleId
        ? await tx.paymentSchedule.findUnique({
            where: { id: body.scheduleId },
            select: {
              studentId: true,
              currency: true,
              amountDue: true,
              amountPaid: true,
              dueDate: true,
              paidAt: true,
            },
          })
        : null;
      if (body.scheduleId && (!schedule || schedule.studentId !== id)) {
        return { ok: false as const, error: "La cuota seleccionada no pertenece al estudiante" };
      }
      if (schedule && schedule.currency !== body.currency) {
        return { ok: false as const, error: "La moneda del pago no coincide con la cuota" };
      }

      const created = await tx.payment.create({
        data: {
          studentId: id,
          scheduleId: body.scheduleId ?? null,
          amount: body.amount,
          currency: body.currency,
          paidAt,
          method: body.method ?? null,
          reference: body.reference ?? null,
          notes: body.notes ?? null,
          recordedById: actor.userId,
        },
      });

      if (body.scheduleId && schedule) {
        const amountPaid = Number(schedule.amountPaid) + body.amount;
        const status = deriveScheduleStatus(
          {
            amountDue: Number(schedule.amountDue),
            amountPaid,
            dueDate: schedule.dueDate,
          },
          new Date(),
        );
        await tx.paymentSchedule.update({
          where: { id: body.scheduleId },
          data: {
            amountPaid,
            status,
            paidAt: status === "PAID" ? paidAt : schedule.paidAt,
          },
        });
      }

      return { ok: true as const, payment: created };
    });
    if (!result.ok) return jsonError(400, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.payment.create",
      target: id,
      metadata: {
        amount: body.amount,
        currency: body.currency,
        scheduleId: body.scheduleId,
      },
    });

    return NextResponse.json({ payment: result.payment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
