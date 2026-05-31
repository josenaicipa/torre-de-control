// Helpers compartidos para manipular el periodo (mes seleccionado) entre
// /radar, /rankings y /segmentos. Mantener todo puro y server-safe para que
// los Server Components y los tests puedan importarlos sin tocar Next.js.

export interface PeriodRef {
  year: number;
  month: number;
}

export interface ParsedPeriod {
  year?: number;
  month?: number;
}

// Convierte el valor crudo de un search param (`?period=YYYY-M`) en
// `{ year, month }`. Devuelve `{}` si el formato no es válido para que el
// loader caiga en el mes más reciente disponible.
export function parsePeriod(value: string | string[] | undefined): ParsedPeriod {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return {};
  const [y, m] = v.split("-");
  const year = Number.parseInt(y ?? "", 10);
  const month = Number.parseInt(m ?? "", 10);
  if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
  return {};
}

export function periodKey(ref: PeriodRef): string {
  return `${ref.year}-${ref.month}`;
}

// Construye un querystring estable a partir de pares clave/valor. Omite los
// valores nulos o vacíos para no ensuciar la URL.
export function buildSearchString(
  params: Record<string, string | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Une `basePath` con los parámetros filtrados por `buildSearchString`.
export function buildHref(
  basePath: string,
  params: Record<string, string | null | undefined>,
): string {
  return `${basePath}${buildSearchString(params)}`;
}
