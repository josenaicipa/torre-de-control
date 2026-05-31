import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { buildMemberDiagnostic } from "@/lib/comunidad-dropi-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns an automated diagnostic for a single Comunidad Dropi member based
// on the last 12 weekly and 6 monthly reports we have on file. The heavy
// lifting lives in `buildMemberDiagnostic`; this route only loads rows and
// shapes them for the helper.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;

    const member = await prisma.dropiCommunityMember.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        country: true,
        currentSegment: true,
        currentPriority: true,
        currentStatus: true,
        firstReportedAt: true,
        lastReportedAt: true,
      },
    });
    if (!member) return jsonError(404, "Miembro no encontrado");

    const [weekly, monthly] = await Promise.all([
      prisma.dropiWeeklyMetric.findMany({
        where: { memberId: id },
        orderBy: { periodStart: "desc" },
        take: 12,
        select: {
          periodStart: true,
          periodEnd: true,
          ordersEntered: true,
          ordersMoved: true,
          ordersDelivered: true,
          ordersReturned: true,
          deltaOrdersPercent: true,
        },
      }),
      prisma.dropiMonthlyMetric.findMany({
        where: { memberId: id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 6,
        select: {
          year: true,
          month: true,
          ordersEntered: true,
          ordersMoved: true,
          ordersDelivered: true,
          ordersReturned: true,
        },
      }),
    ]);

    const diagnostic = buildMemberDiagnostic({
      member,
      weekly: weekly.map((w) => ({
        periodStart: w.periodStart,
        periodEnd: w.periodEnd,
        ordersEntered: w.ordersEntered,
        ordersMoved: w.ordersMoved,
        ordersDelivered: w.ordersDelivered,
        ordersReturned: w.ordersReturned,
        deltaOrdersPercent:
          w.deltaOrdersPercent == null ? null : Number(w.deltaOrdersPercent),
      })),
      monthly,
    });

    return NextResponse.json({ ok: true, data: diagnostic });
  } catch (err) {
    return handleApiError(err);
  }
}
