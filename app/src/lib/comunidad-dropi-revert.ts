/**
 * Pure, side-effect-free building blocks for reverting a single Comunidad Dropi
 * import batch. Mirrors the split used by comunidad-dropi-reset.ts: the decision
 * logic lives here (and is unit-tested), while the Prisma orchestration lives in
 * the imports/[id] route.
 *
 * Reverting a batch is more surgical than the full reset: it only touches the
 * metrics that carry this batch's importBatchId, the follow-ups those metrics
 * triggered, and the members left behind. Operator work must survive, so a
 * follow-up that has been acted on is preserved (only its source link to the
 * deleted metric is cleared) instead of deleted.
 */

import { computeDelta } from "./comunidad-dropi-segments";
import type { DropiPriorityCode } from "./comunidad-dropi-segments";

/**
 * A COMPLETED batch already moved member snapshots, opened follow-ups and fed
 * the radar, so undoing it is a privileged action reserved for ADMIN. Batches
 * that never finished confirming carry no committed effects worth protecting,
 * so OPERATOR may also discard them.
 */
export function revertRequiresAdmin(status: string): boolean {
  return status === "COMPLETED";
}

export interface FollowUpWorkInput {
  status: string;
  contactedAt?: Date | null;
  outcome?: string | null;
  contactChannel?: string | null;
  result?: string | null;
  notes?: string | null;
  assignedToId?: string | null;
  snoozedUntil?: Date | null;
}

/**
 * True when a follow-up shows any operator activity. Such a follow-up must NOT
 * be deleted during a revert — instead the caller clears its source metric link
 * so it stays in the queue without dangling at a metric that no longer exists.
 * A pristine, untouched follow-up (still OPEN, never contacted, no notes) is
 * pure auto-generated noise from the import and is safe to delete.
 */
export function followUpHasWork(fu: FollowUpWorkInput): boolean {
  if (fu.status !== "OPEN") return true;
  if (fu.contactedAt != null) return true;
  if (fu.outcome != null) return true;
  if (fu.contactChannel != null) return true;
  if (fu.assignedToId != null) return true;
  if (fu.snoozedUntil != null) return true;
  if (fu.result != null && fu.result.trim() !== "") return true;
  if (fu.notes != null && fu.notes.trim() !== "") return true;
  return false;
}

export interface RemainingMetric {
  // For weekly metrics this is periodEnd; for monthly metrics it is the last
  // day of the month (see monthlyReportedAt). Matches how the confirm path
  // derives the "reported at" instant fed to the snapshot guard.
  reportedAt: Date;
  segment: string | null;
  priority: DropiPriorityCode | null;
}

export interface RecomputedSnapshot {
  currentSegment: string | null;
  currentPriority: DropiPriorityCode | null;
  firstReportedAt: Date | null;
  lastReportedAt: Date | null;
}

/**
 * Rebuilds a member's visible snapshot from whatever metrics survive the
 * revert. The "current" fields come from the most recent remaining period and
 * firstReportedAt from the oldest. Returns null when nothing is left, signalling
 * the member is now empty (see memberIsEmptyAfterRevert).
 */
export function recomputeMemberSnapshot(
  metrics: RemainingMetric[],
): RecomputedSnapshot | null {
  if (metrics.length === 0) return null;

  let latest = metrics[0];
  let earliest = metrics[0];
  for (const m of metrics) {
    if (m.reportedAt.getTime() > latest.reportedAt.getTime()) latest = m;
    if (m.reportedAt.getTime() < earliest.reportedAt.getTime()) earliest = m;
  }

  return {
    currentSegment: latest.segment,
    currentPriority: latest.priority,
    lastReportedAt: latest.reportedAt,
    firstReportedAt: earliest.reportedAt,
  };
}

/** Last day of the given month, UTC — mirrors the confirm route's monthly path. */
export function monthlyReportedAt(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export interface SurvivingWeeklyMetric {
  id: string;
  // periodStart/periodEnd mirror the confirm route's "previous" lookup, which
  // matches the most recent metric whose periodEnd < this metric's periodStart.
  periodStart: Date;
  periodEnd: Date;
  ordersEntered: number;
  // What the metric currently stores; used to skip metrics whose previous
  // pointer is unaffected by the revert.
  previousOrdersEntered: number | null;
}

export interface WeeklyDeltaRecompute {
  id: string;
  previousOrdersEntered: number | null;
  deltaOrdersEntered: number | null;
  deltaOrdersPercent: number | null;
}

/**
 * After this batch's weekly metrics are deleted, a surviving week that used to
 * follow one of them now has a different (or no) immediately-preceding week, so
 * its previousOrdersEntered/deltaOrdersEntered/deltaOrdersPercent are stale.
 * Given the weekly metrics that survive the revert for a single member, this
 * recomputes each week's "previous" pointer against the surviving set — exactly
 * as the confirm route does (most recent metric with periodEnd < periodStart,
 * delta via computeDelta) — and returns an update only for the weeks whose
 * previousOrdersEntered actually changed. When no earlier week remains the
 * previous becomes null, matching a member's first reported week.
 */
export function recomputeWeeklyDeltas(
  surviving: SurvivingWeeklyMetric[],
): WeeklyDeltaRecompute[] {
  const updates: WeeklyDeltaRecompute[] = [];

  for (const metric of surviving) {
    let previous: SurvivingWeeklyMetric | null = null;
    for (const candidate of surviving) {
      if (candidate.periodEnd.getTime() >= metric.periodStart.getTime()) {
        continue;
      }
      if (
        previous == null ||
        candidate.periodEnd.getTime() > previous.periodEnd.getTime()
      ) {
        previous = candidate;
      }
    }

    const previousOrdersEntered = previous?.ordersEntered ?? null;
    if (previousOrdersEntered === metric.previousOrdersEntered) continue;

    const { deltaOrders, deltaPercent } = computeDelta(
      metric.ordersEntered,
      previousOrdersEntered,
    );
    updates.push({
      id: metric.id,
      previousOrdersEntered,
      deltaOrdersEntered: deltaOrders,
      deltaOrdersPercent: deltaPercent,
    });
  }

  return updates;
}

export interface MemberRevertState {
  remainingMetricCount: number;
  remainingFollowUpCount: number;
  linkedStudentId: string | null;
}

/**
 * A member is "empty" — and therefore deletable — only when the revert leaves it
 * with no metrics, no follow-ups, and no manual link to a 1-1 Student. The
 * follow-up and student guards stop the cascade delete from wiping preserved
 * operator work or a deliberate link.
 */
export function memberIsEmptyAfterRevert(state: MemberRevertState): boolean {
  return (
    state.remainingMetricCount === 0 &&
    state.remainingFollowUpCount === 0 &&
    state.linkedStudentId == null
  );
}
