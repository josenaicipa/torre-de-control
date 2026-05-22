/**
 * Pure domain functions for ProgressUpdate cadence detection.
 */

export const PROGRESS_WINDOW_DAYS = 15;

export function daysSinceLastUpdate(
  lastUpdateDate: Date | null | undefined,
  today: Date,
): number {
  if (!lastUpdateDate) return Number.POSITIVE_INFINITY;
  const ms = today.getTime() - lastUpdateDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function needsProgressAlert(
  lastUpdateDate: Date | null | undefined,
  today: Date,
  windowDays: number = PROGRESS_WINDOW_DAYS,
): boolean {
  return daysSinceLastUpdate(lastUpdateDate, today) > windowDays;
}
