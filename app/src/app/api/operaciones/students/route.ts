import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { mergeStudentScope } from "@/lib/access";
import { handleApiError } from "@/lib/api-helpers";
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
    if (query.mentorId) where.mentorId = query.mentorId;
    if (query.programId) where.programId = query.programId;
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
          mentor: { select: { id: true, name: true } },
          program: { select: { id: true, slug: true, name: true } },
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
        mentorId: body.mentorId ?? null,
        programId: body.programId ?? null,
        ghlContactId: body.ghlContactId ?? null,
        notes: body.notes ?? null,
        personality: body.personality ?? null,
        legalName: body.legalName ?? null,
      },
      include: {
        mentor: { select: { id: true, name: true } },
        program: { select: { id: true, slug: true, name: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "student.create",
      target: student.id,
      metadata: {
        email: student.email,
        mentorId: student.mentorId,
        programId: student.programId,
      },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
