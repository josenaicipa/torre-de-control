"use client";

// Selector "Ver por" (Semana / Mes) del Rendimiento. Al cambiar la
// granularidad, envía el form contenedor de inmediato para que el período y la
// comparación se recarguen con el tipo correcto, en vez de quedar desfasados
// hasta que el operador toque "Aplicar". Los demás inputs del form (incluido el
// `?period=` oculto del Radar) se preservan porque es el mismo submit GET.

import { COLORS } from "../_lib/tokens";
import type { Granularity } from "../_lib/crecimiento-data";

export function GranularidadAutoSelect({
  defaultValue,
  weeklyAvailable,
}: {
  defaultValue: Granularity;
  weeklyAvailable: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: 600,
      }}
    >
      Ver por
      <select
        name="granularity"
        defaultValue={defaultValue}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{
          padding: "6px 10px",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          fontSize: 12,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
          fontFamily: "inherit",
        }}
      >
        <option value="weekly" disabled={!weeklyAvailable}>
          {weeklyAvailable ? "Semana" : "Semana (sin datos)"}
        </option>
        <option value="monthly">Mes</option>
      </select>
    </label>
  );
}
