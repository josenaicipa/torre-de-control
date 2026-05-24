import { computeSchedule } from "@/domain/payments";
import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { createScheduleSchema } from "@/lib/operaciones-validations";
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

    const schedules = await prisma.paymentSchedule.findMany({
      where: { studentId: id },
      orderBy: { installmentNumber: "asc" },
      include: {
        payments: {
          orderBy: { paidAt: "desc" },
          select: {
            id: true,
            amount: true,
            paidAt: true,
            method: true,
            reference: true,
          },
        },
      },
    });

    return NextResponse.json({ schedules });
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

    const body = createScheduleSchema.parse(await req.json());

    const items = computeSchedule({
      totalAmount: body.totalAmount,
      installments: body.installments,
      firstDueDate: new Date(`${body.firstDueDate}T00:00:00.000Z`),
      frequency: body.frequency,
    });

    const result = await prisma.$transaction(async (tx) => {
      if (body.replaceExisting) {
        const existing = await tx.paymentSchedule.findMany({
          where: { studentId: id },
          include: { _count: { select: { payments: true } } },
        });
        if (existing.some((schedule) => schedule._count.payments > 0)) {
          return { ok: false as const, error: "No se puede reemplazar: hay cuotas con pagos asociados" };
        }
        await tx.paymentSchedule.deleteMany({ where: { studentId: id } });
      } else {
        const count = await tx.paymentSchedule.count({ where: { studentId: id } });
        if (count > 0) {
          return { ok: false as const, error: "Ya existe un cronograma. Use replaceExisting=true para reemplazarlo." };
        }
      }

      const schedules = await Promise.all(
        items.map((item) =>
          tx.paymentSchedule.create({
            data: {
              studentId: id,
              installmentNumber: item.installmentNumber,
              amountDue: item.amountDue,
              currency: body.currency,
              dueDate: item.dueDate,
            },
          }),
        ),
      );
      return { ok: true as const, schedules };
    });
    if (!result.ok) return jsonError(409, result.error);

    await writeAudit({
      actorId: actor.userId,
      action: "student.schedule.create",
      target: id,
      metadata: {
        installments: body.installments,
        totalAmount: body.totalAmount,
        currency: body.currency,
      },
    });

    return NextResponse.json({ schedules: result.schedules }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
