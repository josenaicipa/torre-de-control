import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  segment: z.string().trim().min(1).optional(),
  priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "WATCHLIST"]).optional(),
  linked: z.enum(["yes", "no"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { searchParams } = new URL(req.url);
    const query = listQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search } },
        { dropiExternalId: { contains: query.search } },
      ];
    }
    if (query.country) where.country = query.country;
    if (query.segment) where.currentSegment = query.segment;
    if (query.priority) where.currentPriority = query.priority;
    if (query.status) where.currentStatus = query.status;
    if (query.linked === "yes") where.linkedStudentId = { not: null };
    if (query.linked === "no") where.linkedStudentId = null;

    const [items, total] = await Promise.all([
      prisma.dropiCommunityMember.findMany({
        where,
        orderBy: [{ lastReportedAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          linkedStudent: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.dropiCommunityMember.count({ where }),
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
