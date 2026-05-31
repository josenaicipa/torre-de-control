import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { buildByCountry } from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Country distribution. Member counts come from DropiCommunityMember;
// the volume per country uses the LATEST weekly period so the rates are
// representative of the most recent reporting window.
export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const latestPeriod = await prisma.dropiWeeklyMetric.groupBy({
      by: ["periodStart", "periodEnd"],
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
      take: 1,
    });

    const [members, rows] = await Promise.all([
      prisma.dropiCommunityMember.findMany({
        select: { country: true },
      }),
      latestPeriod[0]
        ? prisma.dropiWeeklyMetric.findMany({
            where: {
              periodStart: latestPeriod[0].periodStart,
              periodEnd: latestPeriod[0].periodEnd,
            },
            select: {
              country: true,
              ordersEntered: true,
              ordersMoved: true,
              ordersDelivered: true,
              ordersReturned: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const buckets = buildByCountry({
      members,
      rows,
    });

    return NextResponse.json({
      ok: true,
      data: {
        buckets,
        latestPeriod: latestPeriod[0]
          ? {
              periodStart: latestPeriod[0].periodStart,
              periodEnd: latestPeriod[0].periodEnd,
            }
          : null,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
