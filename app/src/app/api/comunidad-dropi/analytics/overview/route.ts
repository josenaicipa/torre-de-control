import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import {
  buildOverview,
  type OverviewMemberSnapshot,
} from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve the two most recent weekly periods (current + previous) so the
// overview can show deltas. Returns nulls when nothing has been imported.
async function resolveLatestWeeklyPeriods(): Promise<{
  current: { periodStart: Date; periodEnd: Date } | null;
  previous: { periodStart: Date; periodEnd: Date } | null;
}> {
  const periods = await prisma.dropiWeeklyMetric.groupBy({
    by: ["periodStart", "periodEnd"],
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    take: 2,
  });
  const current = periods[0]
    ? { periodStart: periods[0].periodStart, periodEnd: periods[0].periodEnd }
    : null;
  const previous = periods[1]
    ? { periodStart: periods[1].periodStart, periodEnd: periods[1].periodEnd }
    : null;
  return { current, previous };
}

export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const { current, previous } = await resolveLatestWeeklyPeriods();

    const [members, currentRows, previousRows] = await Promise.all([
      prisma.dropiCommunityMember.findMany({
        select: {
          currentSegment: true,
          currentPriority: true,
          currentStatus: true,
          linkedStudentId: true,
          country: true,
        },
      }),
      current
        ? prisma.dropiWeeklyMetric.findMany({
            where: {
              periodStart: current.periodStart,
              periodEnd: current.periodEnd,
            },
            select: {
              ordersEntered: true,
              ordersMoved: true,
              ordersDelivered: true,
              ordersReturned: true,
              memberId: true,
            },
          })
        : Promise.resolve([]),
      previous
        ? prisma.dropiWeeklyMetric.findMany({
            where: {
              periodStart: previous.periodStart,
              periodEnd: previous.periodEnd,
            },
            select: {
              ordersEntered: true,
              ordersMoved: true,
              ordersDelivered: true,
              ordersReturned: true,
              memberId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const snapshots: OverviewMemberSnapshot[] = members.map((m) => ({
      currentSegment: m.currentSegment,
      currentPriority: m.currentPriority,
      currentStatus: m.currentStatus,
      linkedStudentId: m.linkedStudentId,
      country: m.country,
    }));

    const overview = buildOverview({
      members: snapshots,
      currentRows: currentRows.map((r) => ({
        ordersEntered: r.ordersEntered,
        ordersMoved: r.ordersMoved,
        ordersDelivered: r.ordersDelivered,
        ordersReturned: r.ordersReturned,
      })),
      previousRows:
        previousRows.length > 0
          ? previousRows.map((r) => ({
              ordersEntered: r.ordersEntered,
              ordersMoved: r.ordersMoved,
              ordersDelivered: r.ordersDelivered,
              ordersReturned: r.ordersReturned,
            }))
          : null,
      currentMemberCount: new Set(currentRows.map((r) => r.memberId)).size,
      previousMemberCount: new Set(previousRows.map((r) => r.memberId)).size,
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...overview,
        currentPeriod: current,
        previousPeriod: previous,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
