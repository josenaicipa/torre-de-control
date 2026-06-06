import { NextResponse } from "next/server";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista los lotes de importación históricos (source = cartera_legacy) más
// recientes con la cantidad real de estudiantes asociados, para que el panel
// admin pueda ofrecer la reversión segura de cada lote.
export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);

    const batches = await prisma.importBatch.findMany({
      where: { source: "cartera_legacy" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        filename: true,
        status: true,
        totalRows: true,
        createdContacts: true,
        createdAt: true,
        confirmedAt: true,
        _count: { select: { students: true } },
      },
    });

    return NextResponse.json({
      batches: batches.map((batch) => ({
        id: batch.id,
        filename: batch.filename,
        status: batch.status,
        totalRows: batch.totalRows,
        createdContacts: batch.createdContacts,
        createdAt: batch.createdAt,
        confirmedAt: batch.confirmedAt,
        studentsCount: batch._count.students,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
