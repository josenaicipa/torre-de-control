import { NextResponse } from "next/server";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { importCarteraRows, parseCarteraCsv } from "@/lib/legacy-cartera-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Confirma la importación del Cuadro de Pagos histórico: re-parsea el CSV (la
// misma fuente que produjo el preview, para que no haya drift), crea un
// ImportBatch como registro de trazabilidad y persiste estudiantes, miembros,
// cuotas, pagos y atribuciones en una sola transacción. Es idempotente por
// email: re-correr el mismo archivo no duplica estudiantes existentes.
export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "Falta archivo CSV");
    }
    const filename = file.name || "cuadro-pagos.csv";
    const csvText = await file.text();
    if (csvText.length < 10) {
      return jsonError(400, "CSV vacío o inválido");
    }

    const { parsedRows, errors } = parseCarteraCsv(csvText);
    if (errors.length > 0) {
      return jsonError(
        400,
        `El CSV tiene ${errors.length} fila(s) con errores. Corregilas antes de importar.`,
        errors.slice(0, 20),
      );
    }
    if (parsedRows.length === 0) {
      return jsonError(400, "No hay filas válidas para importar");
    }

    const today = new Date();

    const { batch, result } = await prisma.$transaction(
      async (tx) => {
        const batch = await tx.importBatch.create({
          data: {
            source: "cartera_legacy",
            filename,
            uploadedById: actor.userId,
            totalRows: parsedRows.length,
            status: "CONFIRMING",
          },
          select: { id: true },
        });

        const result = await importCarteraRows(tx, {
          parsedRows,
          importBatchId: batch.id,
          actorUserId: actor.userId,
          today,
        });

        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: "COMPLETED",
            matchedRows: result.studentsSkippedExisting,
            createdContacts: result.studentsCreated,
            skippedRows: result.skipped.length + result.studentsSkippedExisting,
            errors: result.skipped.length > 0 ? (result.skipped as never) : undefined,
            confirmedAt: new Date(),
          },
        });

        return { batch, result };
      },
      { maxWait: 15_000, timeout: 120_000 },
    );

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.import.cartera.confirm",
      target: batch.id,
      metadata: {
        filename,
        totalRows: parsedRows.length,
        studentsCreated: result.studentsCreated,
        studentsSkippedExisting: result.studentsSkippedExisting,
        schedulesCreated: result.schedulesCreated,
        paymentsCreated: result.paymentsCreated,
        attributionsCreated: result.attributionsCreated,
        unmatchedCloserRows: result.unmatchedCloserRows,
        rowsSkipped: result.skipped.length,
      },
    });

    return NextResponse.json({ ok: true, batchId: batch.id, result });
  } catch (err) {
    return handleApiError(err);
  }
}
