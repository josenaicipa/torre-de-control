import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"]).optional(),
  priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  assignedToId: z.string().optional().nullable(),
  suggestedAction: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  result: z.string().trim().max(1000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  contactedAt: z.string().optional().nullable(),
  nextActionAt: z.string().optional().nullable(),
});

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
