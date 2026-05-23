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
    const programs = await prisma.program.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        durationMonthsDefault: true,
        description: true,
      },
    });
    return NextResponse.json({ programs });
  } catch (err) {
    return handleApiError(err);
  }
}
