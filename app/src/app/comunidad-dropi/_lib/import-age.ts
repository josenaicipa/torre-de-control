// Clasifica la edad de la última importación confirmada para alertar cuando
// el Pulso puede estar desactualizado. Pura para que los tests cubran los
// bordes (sin fecha, recién importado, antiguo, exactamente en el umbral).

export type ImportAgeStatus = "missing" | "fresh" | "stale";

export interface ImportAgeInfo {
  status: ImportAgeStatus;
  daysSince: number | null;
  formattedDate: string | null;
  message: string;
}

export const STALE_IMPORT_THRESHOLD_DAYS = 14;

export function classifyImportAge(
  lastImportAt: Date | null,
  now: Date = new Date(),
): ImportAgeInfo {
  if (lastImportAt == null) {
    return {
      status: "missing",
      daysSince: null,
      formattedDate: null,
      message: "Sin importación confirmada registrada.",
    };
  }
  const ms = now.getTime() - lastImportAt.getTime();
  const daysSince = Math.max(0, Math.floor(ms / 86_400_000));
  const formattedDate = formatImportDate(lastImportAt);
  if (daysSince > STALE_IMPORT_THRESHOLD_DAYS) {
    return {
      status: "stale",
      daysSince,
      formattedDate,
      message: `Última importación: ${formattedDate} (hace ${daysSince} días). El Pulso puede estar desactualizado.`,
    };
  }
  const suffix = daysSince === 1 ? "día" : "días";
  return {
    status: "fresh",
    daysSince,
    formattedDate,
    message: `Última importación: ${formattedDate} (hace ${daysSince} ${suffix}).`,
  };
}

export function formatImportDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
