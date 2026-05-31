// Pure helpers used by Radar's "Qué hacer hoy" banner and by the per-member
// follow-up state badges. Keep these stateless and Prisma-agnostic so the
// server pages can fetch the minimal projection they need and the unit tests
// can exercise edge cases without a database.
//
// Why this lives outside `follow-ups.ts`: `follow-ups.ts` is the Seguimientos
// query-string + bucket toolkit; mixing the radar aggregations there would
// blur its responsibility. These helpers are read-only summaries instead.

import { startOfUtcDay } from "./follow-ups";

export type FollowUpStatusCode = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export type FollowUpPriorityCode = "P1" | "P2" | "P3" | "P4";

// Minimal projection we need for the radar banner + per-member badge. Pulling
// only these fields keeps the Prisma payload light and the tests easy to
// construct.
export interface FollowUpStatsRow {
  memberId: string;
  status: FollowUpStatusCode | string;
  priority: FollowUpPriorityCode | string;
  dueDate: Date | string | null;
  assignedToId: string | null;
}

export interface RadarFollowUpStats {
  // All currently OPEN or IN_PROGRESS follow-ups (the "active queue").
  openCount: number;
  // Subset of the queue whose priority is P1.
  urgentCount: number;
  // Open follow-ups whose dueDate is strictly before the start of today UTC.
  overdueCount: number;
  // Open follow-ups whose dueDate falls inside today UTC.
  todayCount: number;
  // Open follow-ups without an `assignedToId`.
  unassignedCount: number;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isActiveStatus(status: string): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

// Aggregate counts for the "Qué hacer hoy" banner from a list of follow-ups.
// Callers should pass the already-narrowed projection (active or all — the
// helper filters by status itself so callers don't have to repeat the rule).
export function computeRadarFollowUpStats(
  rows: readonly FollowUpStatsRow[],
  now: Date,
): RadarFollowUpStats {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  let openCount = 0;
  let urgentCount = 0;
  let overdueCount = 0;
  let todayCount = 0;
  let unassignedCount = 0;

  for (const row of rows) {
    if (!isActiveStatus(row.status)) continue;
    openCount++;
    if (row.priority === "P1") urgentCount++;
    if (!row.assignedToId) unassignedCount++;
    const due = toDate(row.dueDate);
    if (!due) continue;
    if (due < todayStart) overdueCount++;
    else if (due < tomorrowStart) todayCount++;
  }

  return {
    openCount,
    urgentCount,
    overdueCount,
    todayCount,
    unassignedCount,
  };
}

// Each member surfaced by the radar reports a single seguimiento status so the
// operator instantly knows whether a follow-up already exists. We bias toward
// the most "actionable" code: OVERDUE > TODAY > IN_PROGRESS > OPEN > NONE.
export type MemberFollowUpState =
  | "NONE"
  | "OPEN"
  | "IN_PROGRESS"
  | "TODAY"
  | "OVERDUE";

export const MEMBER_FOLLOW_UP_STATE_LABELS: Record<MemberFollowUpState, string> = {
  NONE: "Sin seguimiento abierto",
  OPEN: "Seguimiento abierto",
  IN_PROGRESS: "Seguimiento en curso",
  TODAY: "Vence hoy",
  OVERDUE: "Vencido",
};

export const MEMBER_FOLLOW_UP_STATE_COLORS: Record<
  MemberFollowUpState,
  { bg: string; text: string; border: string }
> = {
  NONE: { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" },
  OPEN: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  IN_PROGRESS: { bg: "#E0F2FE", text: "#075985", border: "#7DD3FC" },
  TODAY: { bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" },
  OVERDUE: { bg: "#FEE2E2", text: "#991B1B", border: "#FCA5A5" },
};

export interface MemberFollowUpStatus {
  state: MemberFollowUpState;
  // Display name of the assigned operator if we can resolve one; null when
  // the active follow-up exists but is unassigned, or when there is none at
  // all.
  assignedName: string | null;
}

const STATE_PRIORITY: Record<MemberFollowUpState, number> = {
  OVERDUE: 5,
  TODAY: 4,
  IN_PROGRESS: 3,
  OPEN: 2,
  NONE: 1,
};

function pickWorse(a: MemberFollowUpState, b: MemberFollowUpState): MemberFollowUpState {
  return STATE_PRIORITY[a] >= STATE_PRIORITY[b] ? a : b;
}

export interface FollowUpStateRow extends FollowUpStatsRow {
  assignedName?: string | null;
}

// Build a per-member follow-up status map. The radar uses it to colour each
// member row with the worst active follow-up state (overdue beats today beats
// in-progress beats open). Members with no active follow-up are absent from
// the map — the renderer falls back to `NONE`.
export function buildMemberFollowUpStatus(
  rows: readonly FollowUpStateRow[],
  now: Date,
): Map<string, MemberFollowUpStatus> {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  const out = new Map<string, MemberFollowUpStatus>();
  for (const row of rows) {
    if (!isActiveStatus(row.status)) continue;
    let state: MemberFollowUpState =
      row.status === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN";
    const due = toDate(row.dueDate);
    if (due) {
      if (due < todayStart) state = "OVERDUE";
      else if (due < tomorrowStart) state = "TODAY";
    }
    const prior = out.get(row.memberId);
    if (!prior) {
      out.set(row.memberId, {
        state,
        assignedName: row.assignedName ?? null,
      });
      continue;
    }
    const next: MemberFollowUpStatus = {
      state: pickWorse(prior.state, state),
      assignedName: prior.assignedName ?? row.assignedName ?? null,
    };
    out.set(row.memberId, next);
  }
  return out;
}

export function memberFollowUpStateOf(
  map: ReadonlyMap<string, MemberFollowUpStatus>,
  memberId: string,
): MemberFollowUpStatus {
  return map.get(memberId) ?? { state: "NONE", assignedName: null };
}
