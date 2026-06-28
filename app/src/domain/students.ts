/**
 * Pure domain functions for Student lifecycle calculations.
 * No DB access. Used by API routes and import scripts.
 */
import type { StudentStatus } from "@prisma/client";

export function calculateEndDate(startDate: Date, durationMonths: number): Date {
  if (!Number.isInteger(durationMonths) || durationMonths < 1) {
    throw new Error(
      `durationMonths must be a positive integer, got ${durationMonths}`,
    );
  }
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const startDay = startDate.getUTCDate();

  const targetMonthAbsolute = startMonth + durationMonths;
  const targetYear = startYear + Math.floor(targetMonthAbsolute / 12);
  const targetMonth = ((targetMonthAbsolute % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(startDay, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Reverse of calculateEndDate: returns the whole-month duration that reproduces
 * `end` from `start` via the same calendar logic, or null when no clean integer
 * month count matches (irregular dates). Used to derive a real durationMonths
 * from an enrollment's start/end without ever storing a start/end/duration
 * triple that contradicts itself.
 */
export function deriveDurationMonths(start: Date, end: Date): number | null {
  const s = toUtcDateOnly(start);
  const e = toUtcDateOnly(end);
  if (e.getTime() <= s.getTime()) return null;
  const approx =
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth());
  for (const candidate of [approx, approx - 1, approx + 1]) {
    if (
      candidate >= 1 &&
      calculateEndDate(s, candidate).getTime() === e.getTime()
    ) {
      return candidate;
    }
  }
  return null;
}

export interface StudentActivationInput {
  status: StudentStatus;
  durationAssumed: boolean;
  enrollmentStartedAt: Date | null;
  enrollmentEndsAt: Date | null;
}

export interface StudentActivationUpdate {
  status: "ACTIVE";
  durationAssumed: false;
  startDate?: Date;
  endDate?: Date;
  durationMonths?: number;
}

/**
 * Decides whether a real enrollment / granted access should auto-activate a
 * student, and what to write. Conservative on purpose: only a minimal pending
 * ficha (INACTIVE + durationAssumed=true, the shape n8n/GHL creates) is
 * activated. Manual lifecycle states (WITHDRAWN, DROPPED, ACCESS_REVOKED,
 * SEPARATED, PAUSED…) and real INACTIVE rows (durationAssumed=false) are left
 * untouched so a real enrollment never silently revives a withdrawn student.
 *
 * When activating, the technical default duration is replaced with the
 * enrollment's real dates — but only as a consistent start/end/duration triple
 * (deriveDurationMonths must reproduce the end). Otherwise dates are left as-is
 * rather than persisting a contradictory triple.
 */
export function buildStudentActivationUpdate(
  input: StudentActivationInput,
): StudentActivationUpdate | null {
  const isPendingMinimal =
    input.status === "INACTIVE" && input.durationAssumed === true;
  if (!isPendingMinimal) return null;

  const update: StudentActivationUpdate = {
    status: "ACTIVE",
    durationAssumed: false,
  };

  if (input.enrollmentStartedAt && input.enrollmentEndsAt) {
    const start = toUtcDateOnly(input.enrollmentStartedAt);
    const end = toUtcDateOnly(input.enrollmentEndsAt);
    const months = deriveDurationMonths(start, end);
    if (months) {
      update.startDate = start;
      update.endDate = end;
      update.durationMonths = months;
    }
  }

  return update;
}

export function isPastEndDate(endDate: Date, today: Date): boolean {
  const e = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  const t = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return t >= e;
}
