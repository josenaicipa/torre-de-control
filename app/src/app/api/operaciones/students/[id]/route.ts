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
import { updateStudentSchema } from "@/lib/operaciones-validations";
import { calculateEndDate } from "@/domain/students";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        mentor: { select: { id: true, name: true, email: true } },
        program: { select: { id: true, slug: true, name: true } },
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
    if (!canAccessStudent(actor, student.mentorId)) {
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
      select: { mentorId: true, startDate: true, durationMonths: true },
    });
    if (!existing) return jsonError(404, "Estudiante no encontrado");

    const body = updateStudentSchema.parse(await req.json());

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

    const student = await prisma.student.update({
      where: { id },
      data: data as never,
      include: {
        mentor: { select: { id: true, name: true } },
        program: { select: { id: true, slug: true, name: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.update",
      target: id,
      metadata: body as Record<string, unknown>,
    });

    return NextResponse.json({ student });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);
    const { id } = await params;

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
  } catch (err) {
    return handleApiError(err);
  }
}
