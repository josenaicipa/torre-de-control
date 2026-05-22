/**
 * Pure domain functions for Student lifecycle calculations.
 * No DB access. Used by API routes and import scripts.
 */

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
