import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import {
  buildMonthlyTrend,
  buildWeeklyTrend,
} from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  granularity: z.enum(["weekly", "monthly"]).default("weekly"),
  limit: z.coerce.number().int().min(1).max(52).default(12),
});

export async function GET(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const { searchParams } = new URL(req.url);
    const { granularity, limit } = querySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    if (granularity === "monthly") {
      // Pull the most recent N months across all members. We take a generous
      // multiple of `limit` because rows are per (member, month).
      const periods = await prisma.dropiMonthlyMetric.groupBy({
        by: ["year", "month"],
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: limit,
      });
      if (periods.length === 0) {
        return NextResponse.json({ ok: true, data: { granularity, buckets: [] } });
      }
      const periodKeys = periods.map((p) => ({ year: p.year, month: p.month }));
      const rows = await prisma.dropiMonthlyMetric.findMany({
        where: { OR: periodKeys },
        select: {
          year: true,
          month: true,
          ordersEntered: true,
          ordersMoved: true,
          ordersDelivered: true,
          ordersReturned: true,
          memberId: true,
        },
      });
      const buckets = buildMonthlyTrend(rows);
      return NextResponse.json({
        ok: true,
        data: { granularity, buckets },
      });
    }

    const periods = await prisma.dropiWeeklyMetric.groupBy({
      by: ["periodStart", "periodEnd"],
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
      take: limit,
    });
    if (periods.length === 0) {
      return NextResponse.json({ ok: true, data: { granularity, buckets: [] } });
    }
    const periodKeys = periods.map((p) => ({
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
    }));
    const rows = await prisma.dropiWeeklyMetric.findMany({
      where: { OR: periodKeys },
      select: {
        periodStart: true,
        periodEnd: true,
        ordersEntered: true,
        ordersMoved: true,
        ordersDelivered: true,
        ordersReturned: true,
        memberId: true,
      },
    });
    const buckets = buildWeeklyTrend(rows);
    return NextResponse.json({
      ok: true,
      data: { granularity, buckets },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
