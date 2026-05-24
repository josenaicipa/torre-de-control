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
  createStudentSchema,
  listStudentsQuerySchema,
} from "@/lib/operaciones-validations";
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
    const body = createStudentSchema.parse(await req.json());

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

    const startDate = new Date(body.startDate + "T00:00:00.000Z");
    const endDate = calculateEndDate(startDate, body.durationMonths);

    const student = await prisma.student.create({
      data: {
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
      },
      include: {
        mentorUser: { select: { id: true, name: true, email: true } },
        closerUser: { select: { id: true, name: true, email: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.create",
      target: student.id,
      metadata: {
        email: student.email,
        mentorUserId: student.mentorUserId,
        closerUserId: student.closerUserId,
      },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
