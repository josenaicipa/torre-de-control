import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { updateMentorSchema } from "@/lib/operaciones-validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await params;
    const mentor = await prisma.mentor.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, active: true } },
        _count: { select: { students: true, progressUpdates: true } },
      },
    });
    if (!mentor) return jsonError(404, "Mentor no encontrado");
    return NextResponse.json({ mentor });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);
    const { id } = await params;
    const body = updateMentorSchema.parse(await req.json());

    const mentor = await prisma.mentor.update({
      where: { id },
      data: body,
    });
    await writeAudit({
      actorId: actor.userId,
      action: "mentor.update",
      target: mentor.id,
      metadata: body as Record<string, unknown>,
    });
    return NextResponse.json({ mentor });
  } catch (err) {
    return handleApiError(err);
  }
}
