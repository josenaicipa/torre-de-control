import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { previewCsv } from "@/lib/comunidad-dropi-import";
import { previewXlsx } from "@/lib/comunidad-dropi-xlsx";
import { detectReportPeriodFromName } from "@/lib/comunidad-dropi-normalize";
import { validateUploadPayload } from "@/lib/comunidad-dropi-upload-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileName: z.string().trim().min(1),
  csvContent: z.string().min(1).optional(),
  xlsxBase64: z.string().min(1).optional(),
  reportType: z.enum(["WEEKLY", "MONTHLY"]).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  country: z.string().trim().max(10).optional(),
});

// Preview endpoint. Parses the uploaded CSV, normalizes rows, computes the
// file hash, detects the report period from the name when not provided, and
// stores a PREVIEW_READY DropiImportBatch with the parsed rows kept on the
// errors field so the operator can review before confirming. The confirm step
// re-parses, so a stale preview can never lead to a wrong write.
export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const body = bodySchema.parse(await req.json());
    const upload = validateUploadPayload({
      csvContent: body.csvContent,
      xlsxBase64: body.xlsxBase64,
    });

    let sheetName: string | null = null;
    let preview;
    if (upload.kind === "xlsx") {
      const xlsxPreview = await previewXlsx(upload.xlsxBuffer);
      sheetName = xlsxPreview.sheetName;
      preview = xlsxPreview;
    } else {
      preview = previewCsv(upload.csvContent);
    }

    const existingByHash = await prisma.dropiImportBatch.findFirst({
      where: { fileHash: preview.fileHash },
    });
    if (existingByHash && existingByHash.status === "COMPLETED") {
      return jsonError(409, "Este archivo ya fue importado antes", {
        previousBatchId: existingByHash.id,
      });
    }

    const detected = detectReportPeriodFromName(body.fileName);
    const reportType: "WEEKLY" | "MONTHLY" =
      body.reportType ?? detected?.reportType ?? "WEEKLY";

    // Only inherit detected fields that match the chosen reportType. A manual
    // override (e.g. operator forcing MONTHLY) must never reuse a weekly range
    // we detected earlier, otherwise the batch ends up as MONTHLY but with
    // stale periodStart/periodEnd values that confuse the confirm step.
    const detectedMatches = detected?.reportType === reportType;
    const periodStart =
      reportType === "WEEKLY"
        ? body.periodStart
          ? new Date(body.periodStart + "T00:00:00.000Z")
          : detectedMatches
          ? detected?.periodStart ?? null
          : null
        : null;
    const periodEnd =
      reportType === "WEEKLY"
        ? body.periodEnd
          ? new Date(body.periodEnd + "T00:00:00.000Z")
          : detectedMatches
          ? detected?.periodEnd ?? null
          : null
        : null;
    const year =
      reportType === "MONTHLY"
        ? body.year ?? (detectedMatches ? detected?.year ?? null : null)
        : null;
    const month =
      reportType === "MONTHLY"
        ? body.month ?? (detectedMatches ? detected?.month ?? null : null)
        : null;

    const batch = await prisma.dropiImportBatch.upsert({
      where: { fileHash: preview.fileHash },
      update: {
        fileName: body.fileName,
        reportType,
        periodStart,
        periodEnd,
        year,
        month,
        country: body.country ?? null,
        rowsTotal: preview.rowsTotal,
        rowsProcessed: 0,
        rowsFailed: preview.rowsFailed,
        status: "PREVIEW_READY",
        errors: preview.errors as never,
        uploadedById: actor.userId,
      },
      create: {
        fileName: body.fileName,
        fileHash: preview.fileHash,
        reportType,
        periodStart,
        periodEnd,
        year,
        month,
        country: body.country ?? null,
        rowsTotal: preview.rowsTotal,
        rowsFailed: preview.rowsFailed,
        status: "PREVIEW_READY",
        errors: preview.errors as never,
        uploadedById: actor.userId,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        batchId: batch.id,
        fileHash: preview.fileHash,
        detected,
        reportType,
        periodStart,
        periodEnd,
        year,
        month,
        rowsTotal: preview.rowsTotal,
        rowsValid: preview.rowsValid,
        rowsFailed: preview.rowsFailed,
        detectedColumns: preview.detectedColumns,
        parsedRows: preview.parsedRows.slice(0, 50),
        errors: preview.errors.slice(0, 50),
        sheetName,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
