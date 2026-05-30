// Pure helpers that turn the messy strings we receive from Excel reports into
// stable identity keys. Anything that touches `email`, `phone`, `country`,
// `fullName` or report-type detection in the import pipeline must go through
// here so identity stays consistent across reports and segmentation can rely
// on canonical values.

const PHONE_KEEP = /[^0-9+]/g;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

// Phones are normalized to digits only with an optional leading "+". We do not
// try to parse to strict E.164 here because the input quality is uneven; the
// goal is a stable string key for upsert and a presentable value for the UI.
export function normalizePhone(input: unknown): string | null {
  if (input == null) return null;
  const str = String(input).trim();
  if (!str) return null;
  const cleaned = str.replace(PHONE_KEEP, "");
  if (!cleaned) return null;
  // If multiple "+" survived (rare) keep only the first one.
  if (cleaned.startsWith("+")) {
    const rest = cleaned.slice(1).replace(/\+/g, "");
    if (!rest) return null;
    return "+" + rest;
  }
  return cleaned.replace(/\+/g, "");
}

const COUNTRY_ALIASES: Record<string, string> = {
  CO: "CO",
  COL: "CO",
  COLOMBIA: "CO",
  MX: "MX",
  MEX: "MX",
  MEXICO: "MX",
  MÉXICO: "MX",
  EC: "EC",
  ECU: "EC",
  ECUADOR: "EC",
  PE: "PE",
  PER: "PE",
  PERU: "PE",
  PERÚ: "PE",
  CL: "CL",
  CHL: "CL",
  CHILE: "CL",
};

export function normalizeCountry(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;
  return COUNTRY_ALIASES[trimmed] ?? trimmed.slice(0, 3);
}

export function normalizeFullName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed;
}

export interface DetectedReportPeriod {
  reportType: "WEEKLY" | "MONTHLY";
  periodStart?: Date;
  periodEnd?: Date;
  year?: number;
  month?: number;
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const SPANISH_MONTH_REGEX =
  /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/;

// Try to recognise the period that an upload covers from the file name.
// Examples we accept:
//   "comunidad-dropi-2026-05-01_2026-05-07.xlsx" → weekly 2026-05-01 .. 2026-05-07
//   "dropi 2026-05-06 al 12.xlsx"                → weekly 2026-05-06 .. 2026-05-12
//   "26-04-06 UNLOCKED 1 - 5 ABRIL.xlsx"         → monthly 2026 / 4
//   "dropi 2026-05.xlsx"                          → monthly 2026 / 5
//   "dropi mensual 05 2026.xlsx"                  → monthly 2026 / 5
// If we can't be sure, return null so the UI can ask the operator.
export function detectReportPeriodFromName(
  fileName: string,
): DetectedReportPeriod | null {
  const lower = fileName.toLowerCase();

  // Format A: two full ISO dates separated by `_` or ` `.
  const fullRange = lower.match(
    /(20\d{2})[-./ ](\d{1,2})[-./ ](\d{1,2})[-_._\s]+(20\d{2})[-./ ](\d{1,2})[-./ ](\d{1,2})/,
  );
  if (fullRange) {
    const [, ys, ms, ds, ye, me, de] = fullRange;
    const result = buildWeeklyRange(
      Number(ys),
      Number(ms),
      Number(ds),
      Number(ye),
      Number(me),
      Number(de),
    );
    if (result) return result;
  }

  // Format B: same-month range like "2026-05-06 al 12".
  const sameMonth = lower.match(
    /(20\d{2})[-./ ](\d{1,2})[-./ ](\d{1,2})\s*(?:al|a|-|_|to|hasta)\s*(\d{1,2})\b/,
  );
  if (sameMonth) {
    const [, ys, ms, ds, de] = sameMonth;
    const result = buildWeeklyRange(
      Number(ys),
      Number(ms),
      Number(ds),
      Number(ys),
      Number(ms),
      Number(de),
    );
    if (result) return result;
  }

  // Cumulative monthly files that ops actually produce don't carry a complete
  // weekly ISO range; instead they label the month in Spanish and may include
  // a partial day window like "1 - 5 ABRIL". Once we've ruled the weekly
  // patterns out above, a Spanish month name is the strongest signal we have.
  const monthMatch = lower.match(SPANISH_MONTH_REGEX);
  if (monthMatch) {
    const month = SPANISH_MONTHS[monthMatch[1]];
    const year = detectYearFromName(lower);
    const result: DetectedReportPeriod = { reportType: "MONTHLY", month };
    if (year != null) result.year = year;
    return result;
  }

  const monthly = lower.match(/(20\d{2})[-_./ ](\d{1,2})(?!\d)/);
  if (monthly) {
    const [, ys, ms] = monthly;
    const year = Number(ys);
    const month = Number(ms);
    if (month >= 1 && month <= 12) {
      return { reportType: "MONTHLY", year, month };
    }
  }

  const monthlyHint = lower.includes("mensual") || lower.includes("monthly");
  const weeklyHint = lower.includes("semanal") || lower.includes("weekly");
  if (monthlyHint) return { reportType: "MONTHLY" };
  if (weeklyHint) return { reportType: "WEEKLY" };
  return null;
}

// Pull a 4-digit year from the file name, or fall back to a 2-digit prefix in
// a YY-MM-DD style stamp like "26-04-06" (only when the YY is >= 20 so we do
// not misread a DD-MM-YY date as a year).
function detectYearFromName(lower: string): number | null {
  const full = lower.match(/\b(20\d{2})\b/);
  if (full) return Number(full[1]);
  const short = lower.match(/\b(\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
  if (short) {
    const yy = Number(short[1]);
    if (yy >= 20 && yy <= 99) return 2000 + yy;
  }
  return null;
}

function buildWeeklyRange(
  ys: number,
  ms: number,
  ds: number,
  ye: number,
  me: number,
  de: number,
): DetectedReportPeriod | null {
  if (!validDate(ys, ms, ds) || !validDate(ye, me, de)) return null;
  const periodStart = utcDate(ys, ms, ds);
  const periodEnd = utcDate(ye, me, de);
  if (periodEnd.getTime() < periodStart.getTime()) return null;
  return { reportType: "WEEKLY", periodStart, periodEnd };
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

// Tasa segura: si el divisor es 0 ó nulo devuelve 0. Cap a 100 para no
// distorsionar la UI cuando se reciben filas con datos cruzados (p. ej. más
// entregadas que ingresadas porque el reporte usa ventanas distintas).
export function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0;
  if (numerator <= 0) return 0;
  const rate = (numerator / denominator) * 100;
  if (!isFinite(rate)) return 0;
  if (rate > 1000) return 1000;
  return Math.round(rate * 100) / 100;
}
