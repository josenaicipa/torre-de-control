import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import {
  rankOpportunities,
  ratesFromTotals,
  type MemberOpportunityInput,
} from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Ranks the highest-impact members to follow up next, using the LATEST weekly
// period as the volume signal. Members without a row in the latest period get
// zeroed totals and rely on segment/priority alone to surface.
export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const { searchParams } = new URL(req.url);
    const { limit } = querySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    const latestPeriod = await prisma.dropiWeeklyMetric.groupBy({
      by: ["periodStart", "periodEnd"],
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
      take: 1,
    });

    const [members, latestRows] = await Promise.all([
      prisma.dropiCommunityMember.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          country: true,
          currentSegment: true,
          currentPriority: true,
          currentStatus: true,
        },
      }),
      latestPeriod[0]
        ? prisma.dropiWeeklyMetric.findMany({
            where: {
              periodStart: latestPeriod[0].periodStart,
              periodEnd: latestPeriod[0].periodEnd,
            },
            select: {
              memberId: true,
              ordersEntered: true,
              ordersMoved: true,
              ordersDelivered: true,
              ordersReturned: true,
              deltaOrdersPercent: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const rowsByMember = new Map<
      string,
      {
        ordersEntered: number;
        ordersMoved: number;
        ordersDelivered: number;
        ordersReturned: number;
        deltaOrdersPercent: number | null;
      }
    >();
    for (const r of latestRows) {
      rowsByMember.set(r.memberId, {
        ordersEntered: r.ordersEntered,
        ordersMoved: r.ordersMoved,
        ordersDelivered: r.ordersDelivered,
        ordersReturned: r.ordersReturned,
        deltaOrdersPercent:
          r.deltaOrdersPercent == null ? null : Number(r.deltaOrdersPercent),
      });
    }

    const inputs: MemberOpportunityInput[] = members.map((m) => {
      const row = rowsByMember.get(m.id) ?? {
        ordersEntered: 0,
        ordersMoved: 0,
        ordersDelivered: 0,
        ordersReturned: 0,
        deltaOrdersPercent: null,
      };
      const rates = ratesFromTotals(row);
      return {
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        phone: m.phone,
        country: m.country,
        currentSegment: m.currentSegment,
        currentPriority: m.currentPriority,
        currentStatus: m.currentStatus,
        ordersEntered: row.ordersEntered,
        ordersMoved: row.ordersMoved,
        ordersDelivered: row.ordersDelivered,
        ordersReturned: row.ordersReturned,
        movementRate: rates.movementRate,
        deliveryRate: rates.deliveryRate,
        returnRate: rates.returnRate,
        deltaOrdersPercent: row.deltaOrdersPercent,
      };
    });

    const ranked = rankOpportunities(inputs, limit);

    return NextResponse.json({
      ok: true,
      data: {
        latestPeriod: latestPeriod[0]
          ? {
              periodStart: latestPeriod[0].periodStart,
              periodEnd: latestPeriod[0].periodEnd,
            }
          : null,
        opportunities: ranked,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
