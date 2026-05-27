import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  createProductSchema,
  listCatalogActiveQuerySchema,
} from "@/lib/operaciones-validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { searchParams } = new URL(req.url);
    const query = listCatalogActiveQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const where: Record<string, unknown> = {};
    if (query.active === "true") where.isActive = true;
    else if (query.active === "false") where.isActive = false;

    const products = await prisma.product.findMany({
      where: where as never,
      orderBy: { name: "asc" },
      include: {
        learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({ products });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const body = createProductSchema.parse(await req.json());

    const product = await prisma.product.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description ?? null,
        basePriceUsd: body.basePriceUsd,
        currency: body.currency,
        saleLimit: body.saleLimit,
        allowsInstallments: body.allowsInstallments,
        requiresInitialPayment: body.requiresInitialPayment,
        generatesCommission: body.generatesCommission,
        defaultCommissionPercent: body.defaultCommissionPercent,
        isMainProduct: body.isMainProduct,
        isActive: body.isActive,
        ...(body.learnWorldsAccessConfigs && body.learnWorldsAccessConfigs.length > 0
          ? {
              learnWorldsAccessConfigs: {
                create: body.learnWorldsAccessConfigs.map((cfg) => ({
                  lwProductType: cfg.lwProductType,
                  lwExternalId: cfg.lwExternalId,
                  lwDisplayName: cfg.lwDisplayName ?? null,
                  description: cfg.description ?? null,
                  isActive: cfg.isActive,
                })),
              },
            }
          : {}),
      },
      include: {
        learnWorldsAccessConfigs: { orderBy: { createdAt: "asc" } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.product.create",
      target: product.id,
      metadata: {
        slug: product.slug,
        isMainProduct: product.isMainProduct,
        learnWorldsAccessConfigsCount: product.learnWorldsAccessConfigs.length,
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
