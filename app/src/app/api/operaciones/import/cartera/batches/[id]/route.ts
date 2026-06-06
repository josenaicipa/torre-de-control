import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  ImportBatchNotFoundError,
  ImportBatchSourceError,
  revertCarteraBatch,
} from "@/lib/legacy-cartera-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  confirmBatchId: z.string().trim().min(1),
});

// Revierte un lote histórico (source = cartera_legacy): borra SOLO los
// estudiantes y la data creada por ese lote. Exige confirmación exacta
// (confirmBatchId === id) en el body para evitar borrados accidentales y
// rechaza cualquier lote cuyo source no sea cartera_legacy.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);

    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    if (body.confirmBatchId !== id) {
      return jsonError(
        400,
        "La confirmación no coincide con el id del lote. Verificá el id antes de borrar.",
      );
    }

    let result;
    try {
      result = await prisma.$transaction((tx) => revertCarteraBatch(tx, id), {
        maxWait: 15_000,
        timeout: 120_000,
      });
    } catch (err) {
      if (err instanceof ImportBatchNotFoundError) {
        return jsonError(404, err.message);
      }
      if (err instanceof ImportBatchSourceError) {
        return jsonError(400, err.message);
      }
      throw err;
    }

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.import.cartera.revert",
      target: id,
      metadata: {
        filename: result.filename,
        studentsDeleted: result.studentsDeleted,
        membersDeleted: result.membersDeleted,
        schedulesDeleted: result.schedulesDeleted,
        paymentsDeleted: result.paymentsDeleted,
        attributionsDeleted: result.attributionsDeleted,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return handleApiError(err);
  }
}
