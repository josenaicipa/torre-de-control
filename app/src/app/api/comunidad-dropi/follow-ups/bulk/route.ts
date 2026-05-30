import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  bulkPatchSchema,
  type BulkFailure,
} from "@/app/comunidad-dropi/_lib/bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/comunidad-dropi/follow-ups/bulk
//
// Apply the same patch (status / priority / responsable) to up to 100
// seguimientos in one call. Always responds 200 with a per-id outcome so the
// UI can report partial failures (e.g. a row deleted between the time the
// operator loaded the queue and clicked the bulk action). A single audit event
// covers the successful ids so the activity log shows the operator's intent as
// one batch instead of N noise lines.
export async function PATCH(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== "object") {
      return jsonError(400, "Cuerpo inválido");
    }
    const body = bulkPatchSchema.parse(raw);

    // Resolve the responsable up front so we can fail the whole batch instead
    // of leaving some rows with a dangling FK that the per-row update would
    // throw on. assignedToId === null means "limpiar responsable".
    if (
      body.patch.assignedToId !== undefined &&
      body.patch.assignedToId !== null
    ) {
      const exists = await prisma.user.findUnique({
        where: { id: body.patch.assignedToId },
        select: { id: true, active: true },
      });
      if (!exists || !exists.active) {
        return jsonError(400, "Responsable no encontrado o inactivo");
      }
    }

    const requestedIds = body.ids;
    const found = await prisma.dropiFollowUp.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true },
    });
    const foundSet = new Set(found.map((f) => f.id));

    const failures: BulkFailure[] = [];
    for (const id of requestedIds) {
      if (!foundSet.has(id)) {
        failures.push({
          id,
          code: "NOT_FOUND",
          message: "Seguimiento no encontrado",
        });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.patch.status !== undefined) data.status = body.patch.status;
    if (body.patch.priority !== undefined) data.priority = body.patch.priority;
    if (body.patch.assignedToId !== undefined)
      data.assignedToId = body.patch.assignedToId;

    const updatableIds = requestedIds.filter((id) => foundSet.has(id));

    let updatedCount = 0;
    if (updatableIds.length > 0) {
      const result = await prisma.dropiFollowUp.updateMany({
        where: { id: { in: updatableIds } },
        data,
      });
      updatedCount = result.count;
    }

    const successIds = updatableIds.slice(0, updatedCount);

    if (successIds.length > 0) {
      await writeAudit({
        actorId: actor.userId,
        action: "comunidad_dropi.follow_up.bulk_update",
        metadata: {
          ids: successIds,
          count: successIds.length,
          fields: Object.keys(data),
          patch: body.patch,
          failed: failures.length,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        requested: requestedIds.length,
        updated: updatedCount,
        failed: failures.length,
        failures,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
