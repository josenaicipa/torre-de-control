import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  fullName: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  country: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  currentStatus: z.enum(["ACTIVE", "INACTIVE", "WATCHLIST"]).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;

    const member = await prisma.dropiCommunityMember.findUnique({
      where: { id },
      include: {
        linkedStudent: {
          select: { id: true, fullName: true, email: true, status: true },
        },
        weeklyMetrics: {
          orderBy: { periodStart: "desc" },
          take: 26,
        },
        monthlyMetrics: {
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 12,
        },
        followUps: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!member) return jsonError(404, "Miembro no encontrado");
    return NextResponse.json({ ok: true, data: member });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.dropiCommunityMember.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return jsonError(404, "Miembro no encontrado");

    const updated = await prisma.dropiCommunityMember.update({
      where: { id },
      data: body,
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.member.update",
      target: id,
      metadata: { fields: Object.keys(body) },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
