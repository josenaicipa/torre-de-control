import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updatePaymentAccountSchema } from "@/lib/operaciones-validations";

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

    const existing = await prisma.paymentAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return jsonError(404, "Cuenta receptora no encontrada");

    const body = updatePaymentAccountSchema.parse(await req.json());

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value;
    }

    // Resolving canonical owner / provider lets us refresh the denormalized
    // snapshot strings so the UI keeps rendering even if the underlying row
    // is later renamed or deactivated.
    if (typeof body.ownerUserId === "string") {
      const ownerUser = await prisma.user.findUnique({
        where: { id: body.ownerUserId },
        select: { id: true, name: true, email: true },
      });
      if (!ownerUser) return jsonError(400, "Titular (usuario) no encontrado");
      data.ownerName = ownerUser.name ?? ownerUser.email;
    }
    if (typeof body.paymentProviderId === "string") {
      const provider = await prisma.paymentProvider.findUnique({
        where: { id: body.paymentProviderId },
        select: { id: true, name: true, isActive: true },
      });
      if (!provider) return jsonError(400, "Proveedor no encontrado");
      if (!provider.isActive) {
        return jsonError(400, "El proveedor seleccionado está inactivo");
      }
      data.providerName = provider.name;
    }

    const paymentAccount = await prisma.paymentAccount.update({
      where: { id },
      data: data as never,
      include: {
        ownerUser: { select: { id: true, name: true, email: true } },
        paymentProvider: { select: { id: true, name: true, type: true } },
      },
    });

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.payment_account.update",
      target: id,
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json({ paymentAccount });
  } catch (err) {
    return handleApiError(err);
  }
}
