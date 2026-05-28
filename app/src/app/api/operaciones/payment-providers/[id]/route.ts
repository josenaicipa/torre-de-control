import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updatePaymentProviderSchema } from "@/lib/operaciones-validations";

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

    const existing = await prisma.paymentProvider.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return jsonError(404, "Proveedor no encontrado");

    const body = updatePaymentProviderSchema.parse(await req.json());

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      data[key] = value;
    }

    const paymentProvider = await prisma.paymentProvider.update({
      where: { id },
      data: data as never,
    });

    // Keep account.providerName snapshots in sync when the canonical name
    // changes — the rest of the UI reads from those denormalized strings.
    if (typeof body.name === "string") {
      await prisma.paymentAccount.updateMany({
        where: { paymentProviderId: id },
        data: { providerName: paymentProvider.name },
      });
    }

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.payment_provider.update",
      target: id,
      metadata: { fields: Object.keys(data) },
    });

    return NextResponse.json({ paymentProvider });
  } catch (err) {
    return handleApiError(err);
  }
}
