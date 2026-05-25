import { canAccessStudent } from "@/lib/access";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireMentorOrAbove,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { createProgressUpdateSchema } from "@/lib/operaciones-validations";
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

    const updates = await prisma.progressUpdate.findMany({
      where: { studentId: id },
      orderBy: { periodEnd: "desc" },
      include: {
        mentorUser: { select: { id: true, name: true, email: true } },
        submittedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ updates });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireMentorOrAbove(actor);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, mentorUserId: true },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (actor.role === "MENTOR" && !canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }
    if (!student.mentorUserId) {
      return jsonError(
        400,
        "El estudiante no tiene mentor asignado. Asignale uno antes de crear avances.",
      );
    }
    const mentorUserId = student.mentorUserId;

    const body = createProgressUpdateSchema.parse(await req.json());
    if (body.periodEnd < body.periodStart) {
      return jsonError(400, "periodEnd no puede ser anterior a periodStart");
    }

    const update = await prisma.$transaction(async (tx) => {
      const created = await tx.progressUpdate.create({
        data: {
          studentId: id,
          mentorUserId,
          periodStart: new Date(`${body.periodStart}T00:00:00.000Z`),
          periodEnd: new Date(`${body.periodEnd}T00:00:00.000Z`),
          progressLevel: body.progressLevel,
          bottleneck: body.bottleneck ?? null,
          notes: body.notes,
          rating: body.rating ?? null,
          monthlyRevenue: body.monthlyRevenue ?? null,
          monthlyRevenueCurrency: body.monthlyRevenueCurrency ?? null,
          monthlyOrders: body.monthlyOrders ?? null,
          submittedById: actor.userId,
        },
        include: {
          mentorUser: { select: { id: true, name: true, email: true } },
          submittedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.student.update({
        where: { id },
        data: {
          currentProgressLevel: body.progressLevel,
          currentBottleneck: body.bottleneck ?? null,
        },
      });

      return created;
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.progress.create",
      target: id,
      metadata: {
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        progressLevel: body.progressLevel,
        bottleneck: body.bottleneck,
      },
    });

    return NextResponse.json({ update }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
