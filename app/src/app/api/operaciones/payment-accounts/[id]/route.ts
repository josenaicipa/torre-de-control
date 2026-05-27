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

    const paymentAccount = await prisma.paymentAccount.update({
      where: { id },
      data: data as never,
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
