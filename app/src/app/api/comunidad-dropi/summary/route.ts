import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dashboard KPI bundle for /comunidad-dropi. Keeps every query lightweight so
// the dashboard renders fast even when the community grows. Counts are
// authoritative; lists return top N for the operational shortcuts.
export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const [
      totalMembers,
      activeMembers,
      linkedMembers,
      zeroSales,
      dropping,
      highReturn,
      topPerformers,
      openFollowUps,
      countries,
      recentImports,
    ] = await Promise.all([
      prisma.dropiCommunityMember.count(),
      prisma.dropiCommunityMember.count({ where: { currentStatus: "ACTIVE" } }),
      prisma.dropiCommunityMember.count({
        where: { linkedStudentId: { not: null } },
      }),
      prisma.dropiCommunityMember.count({
        where: { currentSegment: "ZERO_SALES" },
      }),
      prisma.dropiCommunityMember.count({
        where: { currentSegment: "DROPPING" },
      }),
      prisma.dropiCommunityMember.count({
        where: { currentSegment: "HIGH_RETURN_RISK" },
      }),
      prisma.dropiCommunityMember.count({
        where: { currentSegment: "TOP_PERFORMER" },
      }),
      prisma.dropiFollowUp.count({
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      }),
      prisma.dropiCommunityMember.groupBy({
        by: ["country"],
        _count: { _all: true },
        orderBy: { _count: { country: "desc" } },
        take: 10,
      }),
      prisma.dropiImportBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          fileName: true,
          reportType: true,
          status: true,
          rowsTotal: true,
          rowsProcessed: true,
          rowsFailed: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        totalMembers,
        activeMembers,
        linkedMembers,
        zeroSales,
        dropping,
        highReturn,
        topPerformers,
        openFollowUps,
        countries: countries.map((c) => ({
          country: c.country ?? "—",
          total: c._count._all,
        })),
        recentImports,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
