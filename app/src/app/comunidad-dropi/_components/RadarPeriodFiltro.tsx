// Filtro único del Radar: "Ver por" (Semana / Mes) + selector de período +
// Aplicar. Vive arriba y controla toda la sección Radar (KPIs, cohortes y la
// comparación de la sección de Rendimiento). Antes este mismo control vivía
// duplicado dentro de "Rendimiento de la comunidad"; ahora es el único.
//
// La comparación sigue siendo automática contra el período anterior: no hay
// selector de comparación. Si se pide Semana pero no hay semanas cargadas, el
// loader cae a mensual y la sección lo avisa honestamente.

import { COLORS } from "../_lib/tokens";
import type { Comparativo, PeriodRef } from "../_lib/crecimiento-data";
import { formatWeekRange } from "../_lib/radar-cache";
import { GranularidadAutoSelect } from "./GranularidadAutoSelect";

function periodoTitulo(p: PeriodRef): string {
  return p.granularity === "weekly"
    ? formatWeekRange(p.start, p.end)
    : p.label;
}

export function RadarPeriodFiltro({
  comparativo,
  formAction,
}: {
  comparativo: Comparativo;
  formAction: string;
}) {
  const isWeekly = comparativo.granularity === "weekly";
  const principalLabel = isWeekly ? "Semana" : "Mes";
  const weeklyAvailable = comparativo.weeklyAvailable;
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
      <GranularidadAutoSelect
        defaultValue={comparativo.granularity}
        weeklyAvailable={weeklyAvailable}
      />
      <SelectField name="current" label={principalLabel} defaultValue={comparativo.current.key}>
        {comparativo.available.map((p) => (
          <option key={p.key} value={p.key}>
            {periodoTitulo(p)}
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
