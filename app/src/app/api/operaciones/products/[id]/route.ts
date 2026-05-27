import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updateProductSchema } from "@/lib/operaciones-validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await params;

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return jsonError(404, "Producto no encontrado");

    const body = updateProductSchema.parse(await req.json());
    const { learnWorldsAccessConfigs, ...productFields } = body;
    const replaceConfigs = learnWorldsAccessConfigs !== undefined;

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(productFields)) {
      if (value === undefined) continue;
      data[key] = value;
    }

    const product = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.product.update({
          where: { id },
          data: data as never,
        });
      }

      if (replaceConfigs) {
        await tx.learnWorldsAccessConfig.deleteMany({ where: { productId: id } });
        if (learnWorldsAccessConfigs!.length > 0) {
          await tx.learnWorldsAccessConfig.createMany({
            data: learnWorldsAccessConfigs!.map((cfg) => ({
              productId: id,
              lwProductType: cfg.lwProductType,
              lwExternalId: cfg.lwExternalId,
              lwDisplayName: cfg.lwDisplayName ?? null,
              description: cfg.description ?? null,
              isActive: cfg.isActive,
            })),
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: {
          learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
        },
      });
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.product.update",
      target: id,
      metadata: {
        fields: Object.keys(data),
        learnWorldsAccessConfigsReplaced: replaceConfigs
          ? learnWorldsAccessConfigs!.length
          : null,
      },
    });

    return NextResponse.json({ product });
  } catch (err) {
    return handleApiError(err);
  }
}
