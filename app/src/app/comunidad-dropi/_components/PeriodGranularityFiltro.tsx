// Filtro de período unificado del módulo Comunidad Dropi: "Ver por" (Semana /
// Mes) + selector de período + Aplicar. Vive arriba de la sección y dispara un
// submit GET hacia `formAction` preservando la convención
// `?granularity=...&current=<key>`. La comparación es siempre automática contra
// el período anterior (no hay selector manual de comparación).
//
// Es agnóstico de la fuente de datos: recibe la lista de períodos ya resuelta
// como `{ key, label }`. Lo usan tanto el Radar/Crecimiento (sobre `Comparativo`)
// como Inteligencia (sobre su propio motor analítico).

import { COLORS } from "../_lib/tokens";
import type { Granularity } from "../_lib/crecimiento-data";
import { GranularidadAutoSelect } from "./GranularidadAutoSelect";

export interface PeriodOption {
  key: string;
  label: string;
}

export function PeriodGranularityFiltro({
  granularity,
  weeklyAvailable,
  options,
  currentKey,
  formAction,
  hiddenParams,
}: {
  granularity: Granularity;
  weeklyAvailable: boolean;
  options: PeriodOption[];
  currentKey: string;
  formAction: string;
  // Parámetros que el submit GET debe conservar (p. ej. sort/segment/country
  // de Rankings) para no perder los filtros cliente al cambiar de período.
  hiddenParams?: Record<string, string | null | undefined>;
}) {
  const isWeekly = granularity === "weekly";
  const principalLabel = isWeekly ? "Semana" : "Mes";
  const hidden = Object.entries(hiddenParams ?? {}).filter(
    ([, v]) => v != null && v !== "",
  ) as Array<[string, string]>;
  return (
    <form
      method="get"
      action={formAction}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "flex-end",
        justifyContent: "flex-end",
      }}
    >
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <GranularidadAutoSelect
        defaultValue={granularity}
        weeklyAvailable={weeklyAvailable}
      />
      <SelectField name="current" label={principalLabel} defaultValue={currentKey}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </SelectField>
      <button type="submit" style={primaryButtonStyle()}>
        Aplicar
      </button>
      <p
        style={{
          flexBasis: "100%",
          margin: "2px 0 0",
          textAlign: "right",
          fontSize: 11,
          color: COLORS.textMuted,
          fontWeight: 500,
        }}
      >
        La comparación es automática contra {isWeekly ? "la semana" : "el mes"}{" "}
        anterior.
      </p>
    </form>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue: string;
  children: React.ReactNode;
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
      {label}
      <select
        name={name}
        defaultValue={defaultValue}
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
        {children}
      </select>
    </label>
  );
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    padding: "6px 12px",
    border: `1px solid ${COLORS.brand}`,
    borderRadius: 6,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
