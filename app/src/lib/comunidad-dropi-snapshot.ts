// Snapshot guard for DropiCommunityMember.
//
// A member's "current" snapshot (currentSegment, currentPriority, lastReportedAt)
// must reflect the MOST RECENT period observed for that member. The historical
// per-period metric is always upserted, but the snapshot is only refreshed when
// the period being imported is newer than the period we last recorded. This
// keeps re-importing an older week or month from overwriting fresher data with
// stale segments.
//
// Symmetrically, firstReportedAt tracks the EARLIEST period observed: it should
// be set when null, or replaced when the imported period is older than what we
// have stored.

import type { DropiPriorityCode } from "./comunidad-dropi-segments";

export interface SnapshotPatchInput {
  currentFirstReportedAt: Date | null | undefined;
  currentLastReportedAt: Date | null | undefined;
  periodReportedAt: Date;
  newSegment: string;
  newPriority: DropiPriorityCode;
}

export interface SnapshotPatch {
  // True when the imported period is newer than (or equal to) any period seen
  // before, so the visible "current" fields should be refreshed.
  refreshCurrent: boolean;
  currentSegment: string | null;
  currentPriority: DropiPriorityCode | null;
  lastReportedAt: Date | null;

  // True when the imported period is older than (or equal to, on first run)
  // anything seen before; firstReportedAt should be lowered.
  updateFirstReportedAt: boolean;
  firstReportedAt: Date | null;
}

export function computeMemberSnapshotPatch(
  input: SnapshotPatchInput,
): SnapshotPatch {
  const {
    currentFirstReportedAt,
    currentLastReportedAt,
    periodReportedAt,
    newSegment,
    newPriority,
  } = input;

  // Equal periods (a re-import of the SAME week/month, e.g. to fix bad rows)
  // are allowed to refresh the snapshot. Only strictly older periods are
  // blocked so they cannot degrade fresher state.
  const refreshCurrent =
    currentLastReportedAt == null ||
    periodReportedAt.getTime() >= currentLastReportedAt.getTime();

  const updateFirstReportedAt =
    currentFirstReportedAt == null ||
    periodReportedAt.getTime() < currentFirstReportedAt.getTime();

  return {
    refreshCurrent,
    currentSegment: refreshCurrent ? newSegment : null,
    currentPriority: refreshCurrent ? newPriority : null,
    lastReportedAt: refreshCurrent ? periodReportedAt : null,
    updateFirstReportedAt,
    firstReportedAt: updateFirstReportedAt ? periodReportedAt : null,
  };
}
