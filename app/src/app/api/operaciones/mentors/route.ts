import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireAdmin,
} from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { createMentorSchema } from "@/lib/operaciones-validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    const mentors = await prisma.mentor.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        userId: true,
        _count: { select: { students: true } },
      },
    });
    return NextResponse.json({ mentors });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);
    const body = createMentorSchema.parse(await req.json());

    const mentor = await prisma.mentor.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
      },
    });
    await writeAudit({
      actorId: actor.userId,
      action: "mentor.create",
      target: mentor.id,
      metadata: { email: mentor.email },
    });
    return NextResponse.json({ mentor }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
