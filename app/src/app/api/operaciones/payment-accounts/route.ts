import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
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
      include: {
        ownerUser: { select: { id: true, name: true, email: true } },
        paymentProvider: { select: { id: true, name: true, type: true } },
      },
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

    const [ownerUser, provider] = await Promise.all([
      prisma.user.findUnique({
        where: { id: body.ownerUserId },
        select: { id: true, name: true, email: true },
      }),
      prisma.paymentProvider.findUnique({
        where: { id: body.paymentProviderId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);
    if (!ownerUser) return jsonError(400, "Titular (usuario) no encontrado");
    if (!provider) return jsonError(400, "Proveedor no encontrado");
    if (!provider.isActive) {
      return jsonError(400, "El proveedor seleccionado está inactivo");
    }

    const paymentAccount = await prisma.paymentAccount.create({
      data: {
        displayName: body.displayName,
        ownerUserId: ownerUser.id,
        ownerName: ownerUser.name ?? ownerUser.email,
        paymentProviderId: provider.id,
        providerName: provider.name,
        currency: body.currency,
        isActive: body.isActive,
        notes: body.notes ?? null,
      },
      include: {
        ownerUser: { select: { id: true, name: true, email: true } },
        paymentProvider: { select: { id: true, name: true, type: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.payment_account.create",
      target: paymentAccount.id,
      metadata: {
        displayName: paymentAccount.displayName,
        currency: paymentAccount.currency,
        ownerUserId: paymentAccount.ownerUserId,
        paymentProviderId: paymentAccount.paymentProviderId,
      },
    });

    return NextResponse.json({ paymentAccount }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
