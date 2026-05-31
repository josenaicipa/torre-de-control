import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { buildBySegment } from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const members = await prisma.dropiCommunityMember.findMany({
      select: { currentSegment: true },
    });

    return NextResponse.json({
      ok: true,
      data: { buckets: buildBySegment(members) },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
