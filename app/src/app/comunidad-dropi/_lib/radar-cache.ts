// Helpers puros relacionados al cache y formato del Pulso. Viven separados
// de `radar-data.ts` para que los tests puedan importarlos sin arrastrar
// Prisma ni `next/cache`.

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function formatMonthRef(ref: { year: number; month: number }): string {
  const idx = Math.max(0, Math.min(11, ref.month - 1));
  return `${SPANISH_MONTHS[idx]} ${ref.year}`;
}

// Llave estable para el memo cross-request del Pulso mensual. Año/mes
// faltantes o no finitos caen en `latest` para compartir cache con la
// lectura por defecto.
export function radarCacheKey(input: { year?: number; month?: number }): string {
  const y = Number.isFinite(input.year) ? String(input.year) : "latest";
  const m = Number.isFinite(input.month) ? String(input.month) : "latest";
  return `radar:${y}-${m}`;
}

export const WEEKLY_PULSE_CACHE_KEY = "weekly-pulse:latest";

export const AVAILABLE_MONTHS_CACHE_KEY = "available-months";

// Llave estable para el memo cross-request del comparativo de Rendimiento.
// Solo usa strings/números (granularity, keys de período y año/mes del
// fallback) — nunca `Date` — para que no haya que serializar fechas ni se
// generen llaves distintas por instancias `Date` equivalentes.
export function comparativoCacheKey(input: {
  granularity: "weekly" | "monthly";
  currentKey?: string | null;
  comparisonKey?: string | null;
  fallbackMonthly?: { year: number; month: number } | null;
}): string {
  const current = input.currentKey ?? "default";
  const comparison = input.comparisonKey ?? "default";
  const fallback = input.fallbackMonthly
    ? `${input.fallbackMonthly.year}-${input.fallbackMonthly.month}`
    : "none";
  return `comparativo:${input.granularity}:${current}:${comparison}:${fallback}`;
}

// ─── Memo en proceso, compartido por las lecturas del Pulso ─────────────────
//
// Vive acá (y no en `radar-data.ts`) para que tanto el Radar mensual como el
// comparativo de Rendimiento compartan un único Map global: así
// `clearRadarCache()` (que dispara el confirm de importación) invalida ambos
// de una sola pasada. Es puro (solo `globalThis` + `Date.now`), sin Prisma ni
// `next/cache`, así que los tests pueden ejercitarlo sin mocks.
//
// Se hace en proceso en vez de Next `unstable_cache` porque Next serializa el
// valor vía JSON y eso convierte los `Date` a strings; preferimos preservar
// los tipos.

// TTL corto: 60s da margen para que múltiples navegaciones consecutivas
// reutilicen el resultado sin desfasar de forma visible con el estado real.
const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

// Singleton del cache entre hot reloads / múltiples imports del módulo en
// dev — análogo al patrón usado por `prisma.ts`.
const globalForRadarCache = globalThis as unknown as {
  __comunidadDropiRadarCache?: Map<string, CacheEntry<unknown>>;
};

export function getRadarCache(): Map<string, CacheEntry<unknown>> {
  if (!globalForRadarCache.__comunidadDropiRadarCache) {
    globalForRadarCache.__comunidadDropiRadarCache = new Map();
  }
  return globalForRadarCache.__comunidadDropiRadarCache;
}

export async function memoRadar<T>(
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  const cache = getRadarCache();
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    return existing.value;
  }
  const value = build().catch((err) => {
    // Si falla, no dejamos la promesa rota cacheada — la siguiente lectura
    // reintenta desde Prisma.
    cache.delete(key);
    throw err;
  });
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  return value;
}

export function clearRadarCache(): void {
  getRadarCache().clear();
}
