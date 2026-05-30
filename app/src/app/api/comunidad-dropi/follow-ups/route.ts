import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"])
    .optional(),
  priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  reason: z
    .enum([
      "ZERO_SALES",
      "DROP",
      "HIGH_RETURN",
      "LOW_VOLUME",
      "TOP_PERFORMER",
      "OTHER",
    ])
    .optional(),
  assignedToId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const createSchema = z.object({
  memberId: z.string().min(1),
  reason: z.enum([
    "ZERO_SALES",
    "DROP",
    "HIGH_RETURN",
    "LOW_VOLUME",
    "TOP_PERFORMER",
    "OTHER",
  ]),
  priority: z.enum(["P1", "P2", "P3", "P4"]).default("P3"),
  assignedToId: z.string().optional().nullable(),
  suggestedAction: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { searchParams } = new URL(req.url);
    const query = querySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.reason) where.reason = query.reason;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    const [items, total] = await Promise.all([
      prisma.dropiFollowUp.findMany({
        where,
        orderBy: [
          { priority: "asc" },
          { dueDate: "asc" },
          { createdAt: "desc" },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              country: true,
              currentSegment: true,
            },
          },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.dropiFollowUp.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
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
    const body = createSchema.parse(await req.json());

    const member = await prisma.dropiCommunityMember.findUnique({
      where: { id: body.memberId },
      select: { id: true },
    });
    if (!member) return jsonError(404, "Miembro no encontrado");

    const created = await prisma.dropiFollowUp.create({
      data: {
        memberId: body.memberId,
        reason: body.reason,
        priority: body.priority,
        assignedToId: body.assignedToId ?? null,
        suggestedAction: body.suggestedAction ?? null,
        notes: body.notes ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdById: actor.userId,
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.follow_up.create",
      target: created.id,
      metadata: { memberId: body.memberId, reason: body.reason },
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
