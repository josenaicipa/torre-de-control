"use client";

// Tabla ordenable de miembros para una lista del Radar (Top / En caída / En
// aumento). Es el único trozo interactivo de "Rendimiento de la comunidad":
// vive aislado como Client Component para que `RendimientoComunidad.tsx` siga
// siendo un Server Component (recibe Comparativo con PeriodRef que contiene
// Date, no serializable hacia el cliente).
//
// Recibe solo `filas` y `tipo`; arma sus columnas internamente para que el
// indicador de orden visible nunca se desincronice del dato.

import { useState } from "react";

import { COLORS } from "../_lib/tokens";
import type { MemberPeriodRow } from "../_lib/rendimiento";

const fmt = (n: number) => n.toLocaleString("es-CO");

type SortDir = "asc" | "desc";

interface Columna {
  label: string;
  // Solo las columnas numéricas son ordenables; "#" y "Miembro" no.
  getValue?: (m: MemberPeriodRow) => number;
  render: (m: MemberPeriodRow, idx: number) => React.ReactNode;
}

// Define columnas + accesor de orden por tipo de lista. Mantener render y
// orden juntos evita que el indicador visible se desincronice del dato.
function buildColumnas(tipo: "top" | "caida" | "aumento"): Columna[] {
  if (tipo === "top") {
    return [
      { label: "#", render: (_m, idx) => idx + 1 },
      {
        label: "Miembro",
        render: (m) => (
          <MiembroCelda name={m.fullName} country={m.country} id={m.id} />
        ),
      },
      {
        label: "Entregadas",
        getValue: (m) => m.current.ordersDelivered,
        render: (m) => fmt(m.current.ordersDelivered),
      },
      {
        label: "Ingresadas",
        getValue: (m) => m.current.ordersEntered,
        render: (m) => fmt(m.current.ordersEntered),
      },
    ];
  }

  const color = tipo === "caida" ? COLORS.danger : COLORS.success;
  const arrow = tipo === "caida" ? "▼" : "▲";
  const deltaLabel = tipo === "caida" ? "Pérdida" : "Aumento";
  const pctLabel = tipo === "caida" ? "% caída" : "% aumento";

  return [
    {
      label: "Miembro",
      render: (m) => (
        <MiembroCelda name={m.fullName} country={m.country} id={m.id} />
      ),
    },
    {
      label: "Actual",
      getValue: (m) => m.current.ordersDelivered,
      render: (m) => fmt(m.current.ordersDelivered),
    },
    {
      label: "Previo",
      getValue: (m) => m.comparison?.ordersDelivered ?? 0,
      render: (m) => fmt(m.comparison?.ordersDelivered ?? 0),
    },
    {
      label: deltaLabel,
      getValue: (m) => Math.abs(m.deliveredDelta ?? 0),
      render: (m) => (
        <span style={{ color, fontWeight: 700 }}>
          {arrow} {fmt(Math.abs(m.deliveredDelta ?? 0))}
        </span>
      ),
    },
    {
      label: pctLabel,
      getValue: (m) => Math.abs(m.deliveredDeltaPct ?? 0),
      render: (m) => (
        <span style={{ color, fontWeight: 700 }}>
          {m.deliveredDeltaPct != null
            ? `${Math.abs(m.deliveredDeltaPct)}%`
            : "—"}
        </span>
      ),
    },
  ];
}

export function RendimientoSortableTable({
  filas,
  tipo,
}: {
  filas: MemberPeriodRow[];
  tipo: "top" | "caida" | "aumento";
}) {
  const columnas = buildColumnas(tipo);
  // null = orden por defecto que ya entrega `_lib/rendimiento.ts`.
  const [sort, setSort] = useState<{ index: number; dir: SortDir } | null>(
    null,
  );

  const filasOrdenadas = (() => {
    if (!sort) return filas;
    const getValue = columnas[sort.index]?.getValue;
    if (!getValue) return filas;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filas].sort((a, b) => (getValue(a) - getValue(b)) * factor);
  })();

  // 1er clic en una columna: descendente. Siguientes clics: alterna asc/desc.
  const toggleSort = (index: number) => {
    setSort((prev) =>
      prev && prev.index === index
        ? { index, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { index, dir: "desc" },
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: 0,
          fontSize: 12.5,
        }}
      >
        <thead>
          <tr>
            {columnas.map((col, i) => {
              const sortable = col.getValue != null;
              const activo = sort?.index === i;
              const ariaSort = !sortable
                ? undefined
                : activo
                  ? sort!.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
              return (
                <th
                  key={i}
                  scope="col"
                  aria-sort={ariaSort}
                  style={thStyle()}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(i)}
                      style={sortButtonStyle()}
                      title={`Ordenar por ${col.label}`}
                    >
                      <span>{col.label}</span>
                      <span aria-hidden style={sortArrowStyle(activo)}>
                        {activo ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filasOrdenadas.map((m, idx) => (
            <tr
              key={m.id}
              style={{
                backgroundColor: idx % 2 === 0 ? COLORS.surface : COLORS.background,
              }}
            >
              {columnas.map((col, ci) => (
                <td key={ci} style={tdStyle()}>
                  {col.render(m, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiembroCelda({
  name,
  country,
  id,
}: {
  name: string | null;
  country: string | null;
  id: string;
}) {
  return (
    <span style={{ display: "block", minWidth: 150 }}>
      <a href={`/comunidad-dropi/miembros/${id}`} style={memberLinkStyle()}>
        {name ?? "Sin nombre"}
      </a>
      {country ? (
        <span style={{ display: "block", fontSize: 11, color: COLORS.textMuted }}>
          {country}
        </span>
      ) : null}
    </span>
  );
}

function thStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: COLORS.textSoft,
    borderBottom: `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap",
  };
}

// Botón que hace clicable el encabezado ordenable heredando el look del th.
function sortButtonStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    margin: 0,
    padding: 0,
    border: "none",
    background: "none",
    cursor: "pointer",
    font: "inherit",
    color: "inherit",
    letterSpacing: "inherit",
    textTransform: "inherit",
    fontWeight: "inherit",
  };
}

function sortArrowStyle(activo: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    lineHeight: 1,
    color: activo ? COLORS.brand : COLORS.textMuted,
  };
}

function tdStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderTop: `1px solid ${COLORS.border}`,
    verticalAlign: "middle",
    fontVariantNumeric: "tabular-nums",
  };
}

function memberLinkStyle(): React.CSSProperties {
  return {
    color: COLORS.brand,
    fontWeight: 700,
    fontSize: 13,
    textDecoration: "none",
  };
}
