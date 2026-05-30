import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { previewCsv } from "@/lib/comunidad-dropi-import";
import { previewXlsx } from "@/lib/comunidad-dropi-xlsx";
import {
  calculateSegment,
  followUpReasonForSegment,
} from "@/lib/comunidad-dropi-segments";
import { validateUploadPayload } from "@/lib/comunidad-dropi-upload-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  csvContent: z.string().min(1).optional(),
  xlsxBase64: z.string().min(1).optional(),
});

// Confirms a previously previewed batch. We re-parse the CSV the operator
// submitted so the preview can never drift from the confirm. Then we upsert
// members (by Dropi id → email → phone), write the metric row for the
// period, recompute segments + priorities, and finally open follow-ups for
// actionable segments. The whole confirm runs inside one transaction so a
// partial failure leaves no half-written batch.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const batch = await prisma.dropiImportBatch.findUnique({ where: { id } });
    if (!batch) return jsonError(404, "Importación no encontrada");
    if (batch.status === "COMPLETED") {
      return jsonError(409, "La importación ya fue confirmada");
    }

    const upload = validateUploadPayload({
      csvContent: body.csvContent,
      xlsxBase64: body.xlsxBase64,
    });
    const preview =
      upload.kind === "xlsx"
        ? await previewXlsx(upload.xlsxBuffer)
        : previewCsv(upload.csvContent);
    if (batch.fileHash && preview.fileHash !== batch.fileHash) {
      return jsonError(
        400,
        "El contenido enviado no coincide con el archivo del preview",
      );
    }

    const reportType = batch.reportType === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const isWeekly = reportType === "WEEKLY";
    if (isWeekly && (!batch.periodStart || !batch.periodEnd)) {
      return jsonError(
        400,
        "La importación semanal requiere fechas de inicio y fin",
      );
    }
    if (!isWeekly && (!batch.year || !batch.month)) {
      return jsonError(400, "La importación mensual requiere año y mes");
    }

    let rowsProcessed = 0;
    let followUpsOpened = 0;
    const followUpsToCreate: Array<{
      memberId: string;
      reason: "ZERO_SALES" | "DROP" | "HIGH_RETURN" | "LOW_VOLUME" | "TOP_PERFORMER";
      priority: "P1" | "P2" | "P3" | "P4";
      suggestedAction: string;
      sourceWeeklyMetricId: string | null;
      sourceMonthlyMetricId: string | null;
    }> = [];

    await prisma.$transaction(async (tx) => {
      for (const row of preview.parsedRows) {
        const member = await upsertMember(tx, row, batch.country ?? null);
        const segmentInput = {
          ordersEntered: row.ordersEntered,
          ordersDelivered: row.ordersDelivered,
          ordersReturned: row.ordersReturned,
          returnRate: row.returnRate,
          isFirstPeriodSeen: member.firstReportedAt == null,
        };

        let weeklyMetricId: string | null = null;
        let monthlyMetricId: string | null = null;

        if (isWeekly) {
          const previous = await tx.dropiWeeklyMetric.findFirst({
            where: {
              memberId: member.id,
              periodEnd: { lt: batch.periodStart! },
            },
            orderBy: { periodEnd: "desc" },
            select: { ordersEntered: true },
          });
          const segment = calculateSegment({
            ...segmentInput,
            previousOrdersEntered: previous?.ordersEntered ?? null,
          });
          const created = await tx.dropiWeeklyMetric.upsert({
            where: {
              memberId_periodStart_periodEnd: {
                memberId: member.id,
                periodStart: batch.periodStart!,
                periodEnd: batch.periodEnd!,
              },
            },
            update: {
              ordersEntered: row.ordersEntered,
              ordersMoved: row.ordersMoved,
              ordersDelivered: row.ordersDelivered,
              ordersReturned: row.ordersReturned,
              movementRate: row.movementRate,
              deliveryRate: row.deliveryRate,
              returnRate: row.returnRate,
              previousOrdersEntered: previous?.ordersEntered ?? null,
              deltaOrdersEntered: segment.deltaOrders,
              deltaOrdersPercent: segment.deltaPercent ?? null,
              calculatedSegment: segment.segment,
              calculatedPriority: segment.priority,
              country: row.country ?? batch.country ?? null,
              importBatchId: batch.id,
              rawRow: row.raw as never,
            },
            create: {
              memberId: member.id,
              periodStart: batch.periodStart!,
              periodEnd: batch.periodEnd!,
              ordersEntered: row.ordersEntered,
              ordersMoved: row.ordersMoved,
              ordersDelivered: row.ordersDelivered,
              ordersReturned: row.ordersReturned,
              movementRate: row.movementRate,
              deliveryRate: row.deliveryRate,
              returnRate: row.returnRate,
              previousOrdersEntered: previous?.ordersEntered ?? null,
              deltaOrdersEntered: segment.deltaOrders,
              deltaOrdersPercent: segment.deltaPercent ?? null,
              calculatedSegment: segment.segment,
              calculatedPriority: segment.priority,
              country: row.country ?? batch.country ?? null,
              importBatchId: batch.id,
              rawRow: row.raw as never,
            },
          });
          weeklyMetricId = created.id;
          await refreshMemberSnapshot(
            tx,
            member.id,
            segment.segment,
            segment.priority,
            batch.periodEnd!,
          );
          const reason = followUpReasonForSegment(segment.segment);
          if (reason) {
            followUpsToCreate.push({
              memberId: member.id,
              reason,
              priority: segment.priority,
              suggestedAction: suggestedActionFor(reason),
              sourceWeeklyMetricId: weeklyMetricId,
              sourceMonthlyMetricId: null,
            });
          }
        } else {
          const previousMonth = await tx.dropiMonthlyMetric.findFirst({
            where: {
              memberId: member.id,
              OR: [
                { year: { lt: batch.year! } },
                { year: batch.year!, month: { lt: batch.month! } },
              ],
            },
            orderBy: [{ year: "desc" }, { month: "desc" }],
            select: { ordersEntered: true },
          });
          const segment = calculateSegment({
            ...segmentInput,
            previousOrdersEntered: previousMonth?.ordersEntered ?? null,
          });
          const created = await tx.dropiMonthlyMetric.upsert({
            where: {
              memberId_year_month: {
                memberId: member.id,
                year: batch.year!,
                month: batch.month!,
              },
            },
            update: {
              ordersEntered: row.ordersEntered,
              ordersMoved: row.ordersMoved,
              ordersDelivered: row.ordersDelivered,
              ordersReturned: row.ordersReturned,
              monthOverMonthDelta: segment.deltaPercent ?? null,
              trend: segment.trend,
              calculatedSegment: segment.segment,
              calculatedPriority: segment.priority,
              country: row.country ?? batch.country ?? null,
              importBatchId: batch.id,
              rawRow: row.raw as never,
            },
            create: {
              memberId: member.id,
              year: batch.year!,
              month: batch.month!,
              ordersEntered: row.ordersEntered,
              ordersMoved: row.ordersMoved,
              ordersDelivered: row.ordersDelivered,
              ordersReturned: row.ordersReturned,
              monthOverMonthDelta: segment.deltaPercent ?? null,
              trend: segment.trend,
              calculatedSegment: segment.segment,
              calculatedPriority: segment.priority,
              country: row.country ?? batch.country ?? null,
              importBatchId: batch.id,
              rawRow: row.raw as never,
            },
          });
          monthlyMetricId = created.id;
          const periodEnd = new Date(
            Date.UTC(batch.year!, batch.month!, 0),
          );
          await refreshMemberSnapshot(
            tx,
            member.id,
            segment.segment,
            segment.priority,
            periodEnd,
          );
          const reason = followUpReasonForSegment(segment.segment);
          if (reason) {
            followUpsToCreate.push({
              memberId: member.id,
              reason,
              priority: segment.priority,
              suggestedAction: suggestedActionFor(reason),
              sourceWeeklyMetricId: null,
              sourceMonthlyMetricId: monthlyMetricId,
            });
          }
        }
        rowsProcessed++;
      }

      for (const followUp of followUpsToCreate) {
        const existing = await tx.dropiFollowUp.findFirst({
          where: {
            memberId: followUp.memberId,
            reason: followUp.reason,
            status: { in: ["OPEN", "IN_PROGRESS"] },
            ...(followUp.sourceWeeklyMetricId
              ? { sourceWeeklyMetricId: followUp.sourceWeeklyMetricId }
              : { sourceMonthlyMetricId: followUp.sourceMonthlyMetricId }),
          },
          select: { id: true },
        });
        if (existing) continue;
        await tx.dropiFollowUp.create({
          data: {
            memberId: followUp.memberId,
            reason: followUp.reason,
            priority: followUp.priority,
            suggestedAction: followUp.suggestedAction,
            sourceWeeklyMetricId: followUp.sourceWeeklyMetricId,
            sourceMonthlyMetricId: followUp.sourceMonthlyMetricId,
            createdById: actor.userId,
          },
        });
        followUpsOpened++;
      }

      await tx.dropiImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "COMPLETED",
          rowsProcessed,
          rowsFailed: preview.rowsFailed,
          errors: preview.errors as never,
        },
      });
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.import.confirm",
      target: id,
      metadata: {
        rowsProcessed,
        rowsFailed: preview.rowsFailed,
        reportType,
        followUpsOpened,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        batchId: id,
        rowsProcessed,
        rowsFailed: preview.rowsFailed,
        followUpsOpened,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertMember(
  tx: Tx,
  row: import("@/lib/comunidad-dropi-import").ParsedRow,
  batchCountry: string | null,
) {
  let existing = null as Awaited<
    ReturnType<typeof tx.dropiCommunityMember.findFirst>
  > | null;

  if (row.dropiExternalId) {
    existing = await tx.dropiCommunityMember.findFirst({
      where: { dropiExternalId: row.dropiExternalId },
    });
  }
  if (!existing && row.email) {
    existing = await tx.dropiCommunityMember.findFirst({
      where: { email: row.email },
    });
  }
  if (!existing && row.phone) {
    existing = await tx.dropiCommunityMember.findFirst({
      where: { phone: row.phone },
    });
  }

  const country = row.country ?? batchCountry ?? null;
  if (existing) {
    return tx.dropiCommunityMember.update({
      where: { id: existing.id },
      data: {
        fullName: existing.fullName ?? row.fullName,
        email: existing.email ?? row.email,
        phone: existing.phone ?? row.phone,
        country: existing.country ?? country,
        dropiExternalId: existing.dropiExternalId ?? row.dropiExternalId,
      },
    });
  }
  return tx.dropiCommunityMember.create({
    data: {
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      country,
      dropiExternalId: row.dropiExternalId,
    },
  });
}

async function refreshMemberSnapshot(
  tx: Tx,
  memberId: string,
  segment: string,
  priority: "P1" | "P2" | "P3" | "P4",
  reportedAt: Date,
) {
  await tx.dropiCommunityMember.update({
    where: { id: memberId },
    data: {
      currentSegment: segment,
      currentPriority: priority,
      lastReportedAt: reportedAt,
      firstReportedAt: { set: undefined },
    } as never,
  });
  // firstReportedAt is set on the first observation; using a raw conditional
  // update keeps the existing value untouched on later imports.
  await tx.dropiCommunityMember.updateMany({
    where: { id: memberId, firstReportedAt: null },
    data: { firstReportedAt: reportedAt },
  });
}

function suggestedActionFor(reason: string): string {
  switch (reason) {
    case "ZERO_SALES":
      return "Contactar para activar ayuda básica y revisar bloqueos iniciales.";
    case "DROP":
      return "Revisar la caída con la persona y validar producto, oferta o logística.";
    case "HIGH_RETURN":
      return "Auditar productos, mensajes y proveedor para reducir devoluciones.";
    case "LOW_VOLUME":
      return "Plan corto para subir volumen: catálogo, mensajes y rutina diaria.";
    case "TOP_PERFORMER":
      return "Acercamiento para caso de éxito, testimonio o upsell.";
    default:
      return "Revisar y definir próxima acción.";
  }
}
