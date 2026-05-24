import { handleApiError } from "@/lib/api-helpers";
import { getActor, requireActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    const closers = await prisma.user.findMany({
      where: {
        active: true,
        OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        ghlUserName: true,
        _count: { select: { studentsAsCloser: true } },
      },
    });
    return NextResponse.json({ closers });
  } catch (err) {
    return handleApiError(err);
  }
}
