import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));

    const member = await prisma.dropiCommunityMember.findUnique({
      where: { id },
      select: { id: true, linkedStudentId: true },
    });
    if (!member) return jsonError(404, "Miembro no encontrado");
    if (!member.linkedStudentId) {
      return jsonError(400, "El miembro no está vinculado a ningún estudiante");
    }

    const previousStudentId = member.linkedStudentId;
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.dropiCommunityMember.update({
        where: { id },
        data: { linkedStudentId: null },
      });
      await tx.dropiStudentLinkAudit.create({
        data: {
          memberId: id,
          studentId: previousStudentId,
          action: "UNLINKED",
          reason: body.reason ?? null,
          createdById: actor.userId,
        },
      });
      return updated;
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.member.unlink_student",
      target: id,
      metadata: { previousStudentId },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
