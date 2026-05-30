import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { followUpPatchSchema } from "@/app/comunidad-dropi/_lib/follow-up-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;
    const body = followUpPatchSchema.parse(await req.json());

    const existing = await prisma.dropiFollowUp.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return jsonError(404, "Seguimiento no encontrado");

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId;
    if (body.suggestedAction !== undefined)
      data.suggestedAction = body.suggestedAction;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.result !== undefined) data.result = body.result;
    if (body.outcome !== undefined) data.outcome = body.outcome;
    if (body.contactChannel !== undefined)
      data.contactChannel = body.contactChannel;
    if (body.snoozedUntil !== undefined)
      data.snoozedUntil = body.snoozedUntil
        ? new Date(body.snoozedUntil)
        : null;
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.contactedAt !== undefined)
      data.contactedAt = body.contactedAt ? new Date(body.contactedAt) : null;
    if (body.nextActionAt !== undefined)
      data.nextActionAt = body.nextActionAt
        ? new Date(body.nextActionAt)
        : null;

    const updated = await prisma.dropiFollowUp.update({
      where: { id },
      data,
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.follow_up.update",
      target: id,
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
