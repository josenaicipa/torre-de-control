import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { addInstallmentSchema } from "@/lib/operaciones-validations";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
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

    const body = addInstallmentSchema.parse(await req.json());
    const schedule = await prisma.$transaction(async (tx) => {
      const last = await tx.paymentSchedule.findFirst({
        where: { studentId: id },
        orderBy: { installmentNumber: "desc" },
        select: { installmentNumber: true },
      });
      return tx.paymentSchedule.create({
        data: {
          studentId: id,
          installmentNumber: last ? last.installmentNumber + 1 : 1,
          amountDue: body.amountDue,
          currency: "USD",
          dueDate: new Date(`${body.dueDate}T00:00:00.000Z`),
        },
      });
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.schedule.add_installment",
      target: id,
      metadata: {
        amountDue: body.amountDue,
        dueDate: body.dueDate,
        installmentNumber: schedule.installmentNumber,
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
