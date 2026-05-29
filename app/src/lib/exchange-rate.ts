/**
 * Lectura de tasas de cambio oficiales para pagos.
 *
 * COP: usa el dataset abierto TRM de Banco de la República publicado en
 * datos.gov.co (id 32sa-8pi3, endpoint Socrata SODA).
 *
 * Para una fecha dada, devuelve la TRM cuya vigenciadesde es la más
 * reciente <= a esa fecha, lo que cubre fines de semana y feriados
 * (la TRM publicada el viernes sigue vigente sábado y domingo).
 */

export const TRM_DATASET_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json";

export const SOURCE_TRM_DATOS_GOV =
  "datos.gov.co/32sa-8pi3 (TRM Banco de la República)";

export const SOURCE_USD_PAR = "USD paridad 1:1";

export type SupportedCurrency = "USD" | "COP";

export interface ExchangeRateResult {
  currency: string;
  date: string;
  rate: number;
  source: string;
  effectiveDate?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime());
}

/**
 * Normaliza la fila Socrata del dataset TRM a un número.
 * El campo `valor` es un string como "4123.45". `vigenciadesde` viene
 * en ISO con offset (ej "2026-05-28T00:00:00.000"), recortamos a YYYY-MM-DD.
 */
export function parseTrmRow(row: unknown): { rate: number; effectiveDate: string } | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const rawValor = record.valor;
  const rawDesde = record.vigenciadesde;
  if (typeof rawValor !== "string" && typeof rawValor !== "number") return null;
  const rate =
    typeof rawValor === "number"
      ? rawValor
      : Number.parseFloat(rawValor.replace(",", "."));
  if (!Number.isFinite(rate) || rate <= 0) return null;
  let effectiveDate = "";
  if (typeof rawDesde === "string" && rawDesde.length >= 10) {
    effectiveDate = rawDesde.slice(0, 10);
  }
  if (!isIsoDate(effectiveDate)) return null;
  return { rate, effectiveDate };
}

export function buildTrmRequestUrl(date: string): string {
  // Usamos encodeURIComponent directo (no URLSearchParams) porque Socrata
  // espera espacios como %20 y tolera la comilla simple sin escapar, mientras
  // que URLSearchParams aplica codificación form-urlencoded (espacio -> '+',
  // comilla -> %27).
  const params: Array<[string, string]> = [
    ["$where", `vigenciadesde<='${date}T23:59:59.999'`],
    ["$order", "vigenciadesde DESC"],
    ["$limit", "1"],
    ["$select", "valor,vigenciadesde,vigenciahasta"],
  ];
  const query = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${TRM_DATASET_URL}?${query}`;
}

export class ExchangeRateUnavailableError extends Error {
  constructor(message = "No se pudo obtener la TRM oficial para la fecha solicitada") {
    super(message);
    this.name = "ExchangeRateUnavailableError";
  }
}

async function fetchTrm(
  date: string,
  fetchImpl: typeof fetch,
): Promise<{ rate: number; effectiveDate: string }> {
  const url = buildTrmRequestUrl(date);
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ExchangeRateUnavailableError(
      `Fuente TRM respondió ${res.status}`,
    );
  }
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body) || body.length === 0) {
    throw new ExchangeRateUnavailableError(
      "No hay TRM publicada para la fecha solicitada",
    );
  }
  const parsed = parseTrmRow(body[0]);
  if (!parsed) {
    throw new ExchangeRateUnavailableError(
      "La fuente TRM devolvió un registro con formato inesperado",
    );
  }
  return parsed;
}

export interface GetExchangeRateOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Devuelve la tasa de cambio oficial para una moneda y fecha.
 *
 * - USD → 1 (paridad).
 * - COP → TRM publicada por Banco de la República (datos.gov.co).
 * - Otras → lanza ExchangeRateUnavailableError.
 */
export async function getExchangeRate(
  currency: string,
  date: string,
  options: GetExchangeRateOptions = {},
): Promise<ExchangeRateResult> {
  const upper = currency.toUpperCase();
  if (!isIsoDate(date)) {
    throw new ExchangeRateUnavailableError(
      "Fecha inválida (formato esperado YYYY-MM-DD)",
    );
  }
  if (upper === "USD") {
    return {
      currency: "USD",
      date,
      rate: 1,
      source: SOURCE_USD_PAR,
      effectiveDate: date,
    };
  }
  if (upper === "COP") {
    const fetchImpl = options.fetchImpl ?? fetch;
    const { rate, effectiveDate } = await fetchTrm(date, fetchImpl);
    return {
      currency: "COP",
      date,
      rate,
      source: SOURCE_TRM_DATOS_GOV,
      effectiveDate,
    };
  }
  throw new ExchangeRateUnavailableError(
    `Moneda no soportada para tasa automática: ${upper}`,
  );
}
