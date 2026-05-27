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
  createPaymentAccountSchema,
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

    const paymentAccounts = await prisma.paymentAccount.findMany({
      where: where as never,
      orderBy: { displayName: "asc" },
    });

    return NextResponse.json({ paymentAccounts });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const body = createPaymentAccountSchema.parse(await req.json());

    const paymentAccount = await prisma.paymentAccount.create({
      data: {
        displayName: body.displayName,
        ownerName: body.ownerName ?? null,
        providerName: body.providerName ?? null,
        currency: body.currency,
        isActive: body.isActive,
        notes: body.notes ?? null,
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.payment_account.create",
      target: paymentAccount.id,
      metadata: {
        displayName: paymentAccount.displayName,
        currency: paymentAccount.currency,
      },
    });

    return NextResponse.json({ paymentAccount }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
