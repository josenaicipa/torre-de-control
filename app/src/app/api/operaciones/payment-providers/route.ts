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
  createPaymentProviderSchema,
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

    const paymentProviders = await prisma.paymentProvider.findMany({
      where: where as never,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ paymentProviders });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const body = createPaymentProviderSchema.parse(await req.json());

    const paymentProvider = await prisma.paymentProvider.create({
      data: {
        name: body.name,
        type: body.type,
        isActive: body.isActive,
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.payment_provider.create",
      target: paymentProvider.id,
      metadata: { name: paymentProvider.name, type: paymentProvider.type },
    });

    return NextResponse.json({ paymentProvider }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
