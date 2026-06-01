// Selector mensual reutilizable entre /radar, /rankings y /segmentos.
// Server-safe: usa `<form method="get">` para que cambiar el mes haga GET
// hacia la propia ruta preservando los filtros que se pasen en `hiddenParams`.

import { formatMonthRef } from "../_lib/radar-cache";
import type { AvailableMonth } from "../_lib/radar-data";
import { periodKey } from "../_lib/period";
import { COLORS } from "../_lib/tokens";

export function PeriodSelector({
  basePath,
  active,
  available,
  hiddenParams,
  label = "Cambiar mes:",
}: {
  basePath: string;
  active: { year: number; month: number };
  available: AvailableMonth[];
  hiddenParams?: Record<string, string | null | undefined>;
  label?: string;
}) {
  if (available.length <= 1) return null;
  const entries = Object.entries(hiddenParams ?? {}).filter(
    ([, v]) => v != null && v !== "",
  ) as Array<[string, string]>;
  return (
    <form
      method="get"
      action={basePath}
      style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
    >
      {entries.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label
        htmlFor={`period-${basePath.replace(/\W+/g, "-")}`}
        style={{ color: COLORS.textMuted, fontSize: 12 }}
      >
        {label}
      </label>
      <select
        id={`period-${basePath.replace(/\W+/g, "-")}`}
        name="period"
        defaultValue={periodKey(active)}
        style={{
          padding: "4px 8px",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          fontSize: 12,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
          fontFamily: "inherit",
        }}
      >
        {available.map((a) => (
          <option key={periodKey(a)} value={periodKey(a)}>
            {formatMonthRef(a)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          padding: "4px 10px",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          fontSize: 12,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
          cursor: "pointer",
        }}
      >
        Aplicar
      </button>
    </form>
  );
}
