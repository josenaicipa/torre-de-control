import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    const mentors = await prisma.user.findMany({
      where: { role: "MENTOR", active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        ghlUserName: true,
        _count: { select: { studentsAsMentor: true } },
      },
    });
    return NextResponse.json({ mentors });
  } catch (err) {
    return handleApiError(err);
  }
}
