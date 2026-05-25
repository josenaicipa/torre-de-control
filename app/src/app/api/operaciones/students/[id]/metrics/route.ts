import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireMentorOrAbove,
  ForbiddenError,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { upsertMonthlyMetricsSchema } from "@/lib/operaciones-validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
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

    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const where: { studentId: string; year?: number } = { studentId: id };
    if (year) where.year = Number(year);

    const metrics = await prisma.studentMonthlyMetrics.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "asc" }],
      include: {
        reportedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ metrics });
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

    const body = upsertMonthlyMetricsSchema.parse(await req.json());
    const metric = await prisma.studentMonthlyMetrics.upsert({
      where: {
        studentId_year_month_currency: {
          studentId: id,
          year: body.year,
          month: body.month,
          currency: body.currency,
        },
      },
      create: {
        studentId: id,
        year: body.year,
        month: body.month,
        revenue: body.revenue,
        currency: body.currency,
        orders: body.orders,
        status: body.status ?? "reportado",
        notes: body.notes ?? null,
        reportedAt: new Date(),
        reportedById: actor.userId,
      },
      update: {
        revenue: body.revenue,
        orders: body.orders,
        status: body.status ?? "reportado",
        notes: body.notes ?? null,
        reportedAt: new Date(),
        reportedById: actor.userId,
      },
      include: {
        reportedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.monthly_metrics.upsert",
      target: id,
      metadata: {
        year: body.year,
        month: body.month,
        currency: body.currency,
        revenue: body.revenue,
        orders: body.orders,
      },
    });

    return NextResponse.json({ metric });
  } catch (err) {
    return handleApiError(err);
  }
}
