import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  requireActor,
  requireAdmin,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { writeRevertBackupFile } from "@/lib/comunidad-dropi-reset-backup";
import {
  followUpHasWork,
  memberIsEmptyAfterRevert,
  monthlyReportedAt,
  recomputeMemberSnapshot,
  recomputeWeeklyDeltas,
  revertRequiresAdmin,
  type RecomputedSnapshot,
  type RemainingMetric,
  type SurvivingWeeklyMetric,
  type WeeklyDeltaRecompute,
} from "@/lib/comunidad-dropi-revert";
import { bustRadarCache } from "@/app/comunidad-dropi/_lib/radar-data";
import type { DropiPriorityCode } from "@/lib/comunidad-dropi-segments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteBodySchema = z.object({
  confirmBatchId: z.string().min(1),
});

// Detail + revert preview for a single batch. OPERATOR/ADMIN may read it.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;

    const batch = await prisma.dropiImportBatch.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!batch) return jsonError(404, "Importación no encontrada");

    const plan = await buildRevertPlan(id);

    return NextResponse.json({
      ok: true,
      data: {
        batch,
        requiresAdmin: revertRequiresAdmin(batch.status),
        impact: plan.counts,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// Reverts a single import batch: removes the metrics it wrote, cleans up the
// follow-ups it auto-opened (preserving any the team already worked), recomputes
// the snapshot of the members left behind, deletes members that end up empty,
// and finally drops the batch row. A backup is written before anything is
// deleted so the operation can be inspected or restored. The whole revert runs
// inside one transaction so a partial failure leaves the data untouched.
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    const { id } = await ctx.params;

    const batch = await prisma.dropiImportBatch.findUnique({ where: { id } });
    if (!batch) return jsonError(404, "Importación no encontrada");

    // COMPLETED batches already committed their effects → ADMIN only. Anything
    // still in flight may be discarded by an OPERATOR too.
    if (revertRequiresAdmin(batch.status)) {
      requireAdmin(actor);
    } else {
      requireOperatorOrAdmin(actor);
    }

    const body = deleteBodySchema.parse(await req.json().catch(() => ({})));
    if (body.confirmBatchId !== id) {
      return jsonError(
        400,
        "El identificador de confirmación no coincide con la importación.",
      );
    }

    const plan = await buildRevertPlan(id);

    // Backup before deleting anything; abort the revert if it cannot be written.
    let backupFile: string;
    try {
      backupFile = await writeRevertBackupFile(id, {
        batch,
        weeklyMetrics: plan.weeklyMetrics,
        monthlyMetrics: plan.monthlyMetrics,
        followUps: plan.followUps,
        members: plan.members,
      });
    } catch (backupErr) {
      console.error("comunidad-dropi revert backup failed:", backupErr);
      return jsonError(
        500,
        "No se pudo generar el respaldo previo; no se revirtió ningún dato.",
      );
    }

    await prisma.$transaction(
      async (tx) => {
        if (plan.followUpsToDelete.length > 0) {
          await tx.dropiFollowUp.deleteMany({
            where: { id: { in: plan.followUpsToDelete } },
          });
        }

        for (const fu of plan.followUpsToUnlink) {
          await tx.dropiFollowUp.update({
            where: { id: fu.id },
            data: {
              ...(fu.clearWeekly ? { sourceWeeklyMetricId: null } : {}),
              ...(fu.clearMonthly ? { sourceMonthlyMetricId: null } : {}),
            },
          });
        }

        if (plan.weeklyIdsToDelete.length > 0) {
          await tx.dropiWeeklyMetric.deleteMany({
            where: { id: { in: plan.weeklyIdsToDelete } },
          });
        }
        if (plan.monthlyIdsToDelete.length > 0) {
          await tx.dropiMonthlyMetric.deleteMany({
            where: { id: { in: plan.monthlyIdsToDelete } },
          });
        }

        for (const delta of plan.weeklyDeltaUpdates) {
          await tx.dropiWeeklyMetric.update({
            where: { id: delta.id },
            data: {
              previousOrdersEntered: delta.previousOrdersEntered,
              deltaOrdersEntered: delta.deltaOrdersEntered,
              deltaOrdersPercent: delta.deltaOrdersPercent,
            },
          });
        }

        for (const update of plan.memberSnapshotUpdates) {
          await tx.dropiCommunityMember.update({
            where: { id: update.id },
            data: {
              currentSegment: update.snapshot.currentSegment,
              currentPriority:
                update.snapshot.currentPriority as DropiPriorityCode | null,
              firstReportedAt: update.snapshot.firstReportedAt,
              lastReportedAt: update.snapshot.lastReportedAt,
            } as never,
          });
        }

        if (plan.membersToDelete.length > 0) {
          await tx.dropiCommunityMember.deleteMany({
            where: { id: { in: plan.membersToDelete } },
          });
        }

        await tx.dropiImportBatch.delete({ where: { id } });
      },
      { maxWait: 15_000, timeout: 120_000 },
    );

    bustRadarCache();
    revalidatePath("/comunidad-dropi/importaciones");
    revalidatePath("/comunidad-dropi/radar");
    revalidatePath("/comunidad-dropi/rankings");
    revalidatePath("/comunidad-dropi/segmentos");

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.import.revert",
      target: id,
      metadata: {
        fileName: batch.fileName,
        status: batch.status,
        backupFile,
        ...plan.counts,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        batchId: id,
        backup: { performed: true, file: backupFile },
        ...plan.counts,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

interface PlanMetric {
  id: string;
  memberId: string;
  importBatchId: string | null;
  reportedAt: Date;
  segment: string | null;
  priority: DropiPriorityCode | null;
}

/**
 * Reads every row the revert will touch and resolves, in memory, what to delete,
 * unlink, recompute or drop. Used read-only by GET (preview) and as the action
 * plan by DELETE, so the preview shown to the operator is exactly what runs.
 */
async function buildRevertPlan(batchId: string) {
  const [weeklyMetrics, monthlyMetrics] = await Promise.all([
    prisma.dropiWeeklyMetric.findMany({ where: { importBatchId: batchId } }),
    prisma.dropiMonthlyMetric.findMany({ where: { importBatchId: batchId } }),
  ]);

  const batchWeeklyIds = new Set(weeklyMetrics.map((m) => m.id));
  const batchMonthlyIds = new Set(monthlyMetrics.map((m) => m.id));

  const memberIds = Array.from(
    new Set([
      ...weeklyMetrics.map((m) => m.memberId),
      ...monthlyMetrics.map((m) => m.memberId),
    ]),
  );

  const [allWeekly, allMonthly, followUps, members] = await Promise.all([
    memberIds.length
      ? prisma.dropiWeeklyMetric.findMany({
          where: { memberId: { in: memberIds } },
          select: {
            id: true,
            memberId: true,
            importBatchId: true,
            periodStart: true,
            periodEnd: true,
            ordersEntered: true,
            previousOrdersEntered: true,
            calculatedSegment: true,
            calculatedPriority: true,
          },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.dropiMonthlyMetric.findMany({
          where: { memberId: { in: memberIds } },
          select: {
            id: true,
            memberId: true,
            importBatchId: true,
            year: true,
            month: true,
            calculatedSegment: true,
            calculatedPriority: true,
          },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.dropiFollowUp.findMany({
          where: { memberId: { in: memberIds } },
          select: {
            id: true,
            memberId: true,
            status: true,
            contactedAt: true,
            outcome: true,
            contactChannel: true,
            result: true,
            notes: true,
            assignedToId: true,
            snoozedUntil: true,
            sourceWeeklyMetricId: true,
            sourceMonthlyMetricId: true,
          },
        })
      : Promise.resolve([]),
    memberIds.length
      ? prisma.dropiCommunityMember.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, linkedStudentId: true },
        })
      : Promise.resolve([]),
  ]);

  // Normalize all metrics for the affected members into a single shape with a
  // comparable reported-at instant and a flag for "belongs to this batch".
  const metrics: PlanMetric[] = [
    ...allWeekly.map((m) => ({
      id: m.id,
      memberId: m.memberId,
      importBatchId: m.importBatchId,
      reportedAt: m.periodEnd,
      segment: m.calculatedSegment,
      priority: m.calculatedPriority as DropiPriorityCode | null,
    })),
    ...allMonthly.map((m) => ({
      id: m.id,
      memberId: m.memberId,
      importBatchId: m.importBatchId,
      reportedAt: monthlyReportedAt(m.year, m.month),
      segment: m.calculatedSegment,
      priority: m.calculatedPriority as DropiPriorityCode | null,
    })),
  ];

  // Partition the follow-ups linked to this batch's metrics: pristine ones are
  // deleted, worked ones are preserved with their source link cleared.
  const followUpsToDelete: string[] = [];
  const followUpsToUnlink: Array<{
    id: string;
    clearWeekly: boolean;
    clearMonthly: boolean;
  }> = [];
  let followUpsWithWork = 0;

  for (const fu of followUps) {
    const clearWeekly =
      fu.sourceWeeklyMetricId != null &&
      batchWeeklyIds.has(fu.sourceWeeklyMetricId);
    const clearMonthly =
      fu.sourceMonthlyMetricId != null &&
      batchMonthlyIds.has(fu.sourceMonthlyMetricId);
    const linked = clearWeekly || clearMonthly;
    if (!linked) continue;

    if (followUpHasWork(fu)) {
      followUpsToUnlink.push({ id: fu.id, clearWeekly, clearMonthly });
      followUpsWithWork++;
    } else {
      followUpsToDelete.push(fu.id);
    }
  }

  const deletedFollowUpIds = new Set(followUpsToDelete);

  // For each affected member, decide between recomputing its snapshot or
  // deleting it outright once this batch's rows are gone.
  const membersToDelete: string[] = [];
  const memberSnapshotUpdates: Array<{
    id: string;
    snapshot: RecomputedSnapshot;
  }> = [];
  const weeklyDeltaUpdates: WeeklyDeltaRecompute[] = [];

  for (const member of members) {
    const remaining: RemainingMetric[] = metrics
      .filter((m) => m.memberId === member.id && m.importBatchId !== batchId)
      .map((m) => ({
        reportedAt: m.reportedAt,
        segment: m.segment,
        priority: m.priority,
      }));

    const remainingFollowUpCount = followUps.filter(
      (fu) => fu.memberId === member.id && !deletedFollowUpIds.has(fu.id),
    ).length;

    if (
      memberIsEmptyAfterRevert({
        remainingMetricCount: remaining.length,
        remainingFollowUpCount,
        linkedStudentId: member.linkedStudentId,
      })
    ) {
      membersToDelete.push(member.id);
      continue;
    }

    const snapshot = recomputeMemberSnapshot(remaining);
    if (snapshot) {
      memberSnapshotUpdates.push({ id: member.id, snapshot });
    }

    // The deleted weekly metrics may have been the "previous" week for surviving
    // weeks of this member; rebuild their delta against the remaining weeks.
    const survivingWeekly: SurvivingWeeklyMetric[] = allWeekly
      .filter((m) => m.memberId === member.id && !batchWeeklyIds.has(m.id))
      .map((m) => ({
        id: m.id,
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
        ordersEntered: m.ordersEntered,
        previousOrdersEntered: m.previousOrdersEntered,
      }));
    weeklyDeltaUpdates.push(...recomputeWeeklyDeltas(survivingWeekly));
  }

  return {
    weeklyMetrics,
    monthlyMetrics,
    followUps,
    members,
    weeklyIdsToDelete: Array.from(batchWeeklyIds),
    monthlyIdsToDelete: Array.from(batchMonthlyIds),
    followUpsToDelete,
    followUpsToUnlink,
    membersToDelete,
    memberSnapshotUpdates,
    weeklyDeltaUpdates,
    counts: {
      weeklyMetrics: weeklyMetrics.length,
      monthlyMetrics: monthlyMetrics.length,
      affectedMembers: memberIds.length,
      membersDeleted: membersToDelete.length,
      followUpsLinked: followUpsToDelete.length + followUpsWithWork,
      followUpsDeleted: followUpsToDelete.length,
      followUpsPreserved: followUpsWithWork,
      weeklyDeltasRecomputed: weeklyDeltaUpdates.length,
    },
  };
}
