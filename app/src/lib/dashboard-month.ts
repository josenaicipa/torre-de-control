// Pure helpers used by the Torre dashboard to resolve how the "Ritmo / Proyección"
// block should render for a selected (year, month) relative to "today" in
// America/Bogota. The same logic is duplicated inline in `public/index.html`
// because that file is shipped as a Babel/CDN bundle without a build step;
// keeping a typed copy here gives us a unit-tested source of truth.

export type MonthState = "past" | "current" | "future";

export interface PeriodToday {
  year: number;
  /** 0-indexed month, matching JS `Date#getMonth()` and the dashboard state. */
  month: number;
  /** Day of month, 1-31. */
  day: number;
}

export function resolveMonthState(
  selectedYear: number,
  selectedMonth: number,
  today: PeriodToday,
): MonthState {
  if (
    selectedYear < today.year ||
    (selectedYear === today.year && selectedMonth < today.month)
  ) {
    return "past";
  }
  if (selectedYear === today.year && selectedMonth === today.month) {
    return "current";
  }
  return "future";
}

export interface RhythmInputs {
  state: MonthState;
  /** Days in the selected month. */
  daysInMonth: number;
  /**
   * Legacy/manual day-of-month stored in KPI config. Kept in the type so older
   * callers/tests continue to compile, but current-month rhythm must use the
   * real dashboard date instead of this stale snapshot value.
   */
  cfgDay: number | null;
  /** Today's day-of-month in the dashboard timezone. */
  todayDay: number;
}

export interface Rhythm {
  /**
   * Effective "day of month" the rhythm uses. For past months we force the
   * final day (the month is closed); for future months we use 0 so the UI
   * cannot invent progress; for the current month we use today's real day and
   * ignore stale/manual cfg.day values.
   */
  day: number;
  /** Fraction of the month considered elapsed (0..1). */
  pctElapsed: number;
}

export function resolveRhythm(inputs: RhythmInputs): Rhythm {
  const { state, daysInMonth, todayDay } = inputs;
  if (state === "past") {
    return { day: daysInMonth, pctElapsed: 1 };
  }
  if (state === "future") {
    return { day: 0, pctElapsed: 0 };
  }
  const day = Math.min(Math.max(todayDay, 0), daysInMonth);
  return { day, pctElapsed: daysInMonth > 0 ? day / daysInMonth : 0 };
}

export interface ProjectionInputs {
  state: MonthState;
  day: number;
  daysInMonth: number;
  cashCollected: number;
}

/**
 * Returns the projected end-of-month cash for the current month only.
 * Past months are already closed (no projection); future months must not
 * fabricate progress.
 */
export function resolveProjection(inputs: ProjectionInputs): number | null {
  const { state, day, daysInMonth, cashCollected } = inputs;
  if (state !== "current") return null;
  if (day <= 0 || cashCollected <= 0) return null;
  return (cashCollected / day) * daysInMonth;
}

/**
 * Parses a `YYYY-MM-DD` ISO date (e.g. produced by the dashboard's
 * `today()` helper for America/Bogota) into the shape `resolveMonthState`
 * expects.
 */
export function parseIsoDate(iso: string): PeriodToday {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}
