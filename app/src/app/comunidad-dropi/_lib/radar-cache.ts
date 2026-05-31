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
