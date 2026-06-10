// Sección única y accionable del Radar: "Rendimiento de la comunidad".
//
// Reemplaza al comparativo + cohortes en el Radar para no fragmentar la
// pantalla. Muestra:
//   1) los 3 KPIs obligatorios del período: pedidos entregados, pedidos
//      ingresados y total entregados de la comunidad (devolución como dato
//      secundario),
//   2) tres listas en acordeón (<details>/<summary>): Top 20 por entregas,
//      En caída y En aumento, calculadas sobre el período filtrado.
//
// El filtro Semana / Mes vive arriba (RadarPeriodFiltro) y controla todo el
// Radar; esta sección solo refleja el período activo, no lo elige.
//
// Puramente presentacional: la lógica de listas vive en `_lib/rendimiento.ts`
// y los datos en `_lib/crecimiento-data.ts`.

import { COLORS } from "../_lib/tokens";
import type { Comparativo, PeriodRef } from "../_lib/crecimiento-data";
import { formatWeekRange, isWeeklyFallback } from "../_lib/radar-cache";
import {
  decliningRows,
  risingRows,
  topDeliveredRows,
  type MemberPeriodRow,
} from "../_lib/rendimiento";

export interface RendimientoComunidadProps {
  comparativo: Comparativo;
}

const fmt = (n: number) => n.toLocaleString("es-CO");

// Título legible de un período: rango "01 may – 07 may" para semanas,
// "Mayo 2026" para meses (que ya viene formateado en `label`).
function periodoTitulo(p: PeriodRef): string {
  return p.granularity === "weekly"
    ? formatWeekRange(p.start, p.end)
    : p.label;
}

export function RendimientoComunidad({
  comparativo,
}: RendimientoComunidadProps) {
  const isWeekly = comparativo.granularity === "weekly";
  const weeklyFallback = isWeeklyFallback(comparativo);
  const currentTitulo = periodoTitulo(comparativo.current);
  const compLabel = comparativo.comparison
    ? periodoTitulo(comparativo.comparison)
    : null;

  const top = topDeliveredRows(comparativo.memberRows, 20);
  const declining = decliningRows(comparativo.memberRows);
  const rising = risingRows(comparativo.memberRows);

  return (
    <section
      aria-label="Rendimiento de la comunidad"
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <p style={eyebrowStyle()}>Pedidos de la comunidad</p>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            Rendimiento de la comunidad
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: COLORS.textSoft,
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: COLORS.text }}>
              {isWeekly ? "Semana" : "Mes"}: {currentTitulo}
            </strong>{" "}
            <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>
              {compLabel
                ? `vs. ${isWeekly ? "semana" : "mes"} anterior (${compLabel})`
                : `Sin ${isWeekly ? "semana" : "mes"} anterior para comparar`}
            </span>
            {" · "}
            {isWeekly ? "Vista semanal" : "Vista mensual"}
          </p>
        </div>
      </header>

      {weeklyFallback ? (
        <AvisoFallbackSemanal mes={comparativo.current.label} />
      ) : null}

      <KpiRow comparativo={comparativo} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <Acordeon
          titulo={`Top ${top.length} por entregas`}
          resumen="Quién entregó más en el período."
          vacio="Sin miembros con entregas en este período."
          filas={top}
          tipo="top"
        />
        <Acordeon
          titulo="En caída"
          resumen="Entregaron menos que el período de comparación. Mayor pérdida primero."
          vacio="Ningún miembro cayó en entregas vs. la comparación."
          filas={declining}
          tipo="caida"
          alerta
        />
        <Acordeon
          titulo="En aumento"
          resumen="Entregaron más que el período de comparación. Mayor crecimiento primero."
          vacio="Ningún miembro creció en entregas vs. la comparación."
          filas={rising}
          tipo="aumento"
        />
      </div>
    </section>
  );
}

function KpiRow({ comparativo }: { comparativo: Comparativo }) {
  const { delivered, entered, returned } = comparativo.kpis;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
      }}
    >
      <KpiCard label="Pedidos entregados" value={delivered.current} deltaPct={delivered.deltaPct} hero />
      <KpiCard label="Pedidos ingresados" value={entered.current} deltaPct={entered.deltaPct} />
      <KpiCard
        label="Total entregados comunidad"
        value={delivered.current}
        hint="Suma de entregadas de toda la comunidad en el período."
      />
      <KpiCard
        label="Devoluciones"
        value={returned.current}
        deltaPct={returned.deltaPct}
        invertDelta
        secondary
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  deltaPct,
  hero,
  secondary,
  invertDelta,
  hint,
}: {
  label: string;
  value: number;
  deltaPct?: number | null;
  hero?: boolean;
  secondary?: boolean;
  invertDelta?: boolean;
  hint?: string;
}) {
  const showDelta = deltaPct != null && Number.isFinite(deltaPct);
  const positive = (deltaPct ?? 0) >= 0;
  const good = invertDelta ? COLORS.danger : COLORS.success;
  const bad = invertDelta ? COLORS.success : COLORS.danger;
  const deltaColor = positive ? good : bad;
  return (
    <div
      style={{
        backgroundColor: secondary ? COLORS.background : COLORS.surface,
        border: `1px solid ${hero ? COLORS.brand : COLORS.border}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: hero ? "0 1px 0 rgba(242,48,5,0.08)" : "none",
      }}
    >
      <p style={eyebrowStyle()}>{label}</p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: hero ? 28 : 22,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: COLORS.text,
        }}
      >
        {fmt(value)}
      </p>
      {showDelta ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            fontWeight: 700,
            color: deltaColor,
          }}
        >
          {positive ? "▲" : "▼"} {Math.abs(deltaPct as number)}% vs. período anterior
        </p>
      ) : hint ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            color: COLORS.textMuted,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      ) : (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.textMuted }}>
          Sin período anterior
        </p>
      )}
    </div>
  );
}

function AvisoFallbackSemanal({ mes }: { mes: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        backgroundColor: "#FEF3C7",
        border: "1px solid #FCD34D",
        color: "#92400E",
        fontSize: 12.5,
        fontWeight: 600,
        marginBottom: 14,
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>
        ⚠
      </span>
      <span>
        No hay semanas cargadas; mostrando el mes <strong>{mes}</strong>. Importá
        un cierre semanal para activar la vista por semana.
      </span>
    </div>
  );
}

function Acordeon({
  titulo,
  resumen,
  vacio,
  filas,
  tipo,
  alerta,
}: {
  titulo: string;
  resumen: string;
  vacio: string;
  filas: MemberPeriodRow[];
  tipo: "top" | "caida" | "aumento";
  alerta?: boolean;
}) {
  return (
    <details
      style={{
        border: `1px solid ${alerta && filas.length > 0 ? "#FCA5A5" : COLORS.border}`,
        borderRadius: 12,
        backgroundColor: COLORS.background,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>
          {titulo}
        </span>
        <span style={countBadgeStyle(alerta)}>
          {filas.length} miembro{filas.length === 1 ? "" : "s"}
        </span>
        <span style={{ fontSize: 12, color: COLORS.textMuted, flex: 1, minWidth: 180 }}>
          {resumen}
        </span>
        <span style={{ fontSize: 12, color: COLORS.brand, fontWeight: 700 }}>
          Ver / ocultar
        </span>
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        {filas.length === 0 ? (
          <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>{vacio}</p>
        ) : (
          <ListaTabla filas={filas} tipo={tipo} />
        )}
      </div>
    </details>
  );
}

function ListaTabla({
  filas,
  tipo,
}: {
  filas: MemberPeriodRow[];
  tipo: "top" | "caida" | "aumento";
}) {
  const headers =
    tipo === "top"
      ? ["#", "Miembro", "Entregadas", "Ingresadas"]
      : tipo === "caida"
        ? ["Miembro", "Actual", "Previo", "Pérdida", "% caída"]
        : ["Miembro", "Actual", "Previo", "Aumento", "% aumento"];

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
            {headers.map((h, i) => (
              <th key={i} style={thStyle()}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((m, idx) => (
            <tr
              key={m.id}
              style={{
                backgroundColor: idx % 2 === 0 ? COLORS.surface : COLORS.background,
              }}
            >
              {tipo === "top"
                ? renderTopCells(m, idx)
                : renderDeltaCells(m, tipo)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderTopCells(m: MemberPeriodRow, idx: number) {
  return (
    <>
      <td style={tdStyle()}>{idx + 1}</td>
      <td style={tdStyle()}>
        <MiembroCelda name={m.fullName} country={m.country} id={m.id} />
      </td>
      <td style={tdStyle()}>{fmt(m.current.ordersDelivered)}</td>
      <td style={tdStyle()}>{fmt(m.current.ordersEntered)}</td>
    </>
  );
}

function renderDeltaCells(m: MemberPeriodRow, tipo: "caida" | "aumento") {
  const previo = m.comparison?.ordersDelivered ?? 0;
  const delta = m.deliveredDelta ?? 0;
  const color = tipo === "caida" ? COLORS.danger : COLORS.success;
  const pct = m.deliveredDeltaPct;
  return (
    <>
      <td style={tdStyle()}>
        <MiembroCelda name={m.fullName} country={m.country} id={m.id} />
      </td>
      <td style={tdStyle()}>{fmt(m.current.ordersDelivered)}</td>
      <td style={tdStyle()}>{fmt(previo)}</td>
      <td style={{ ...tdStyle(), color, fontWeight: 700 }}>
        {tipo === "caida" ? "▼" : "▲"} {fmt(Math.abs(delta))}
      </td>
      <td style={{ ...tdStyle(), color, fontWeight: 700 }}>
        {pct != null ? `${Math.abs(pct)}%` : "—"}
      </td>
    </>
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

function eyebrowStyle(): React.CSSProperties {
  return {
    margin: 0,
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };
}

function countBadgeStyle(alerta?: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: alerta ? "#FEE2E2" : "#E2E8F0",
    color: alerta ? "#991B1B" : "#475569",
    fontSize: 11,
    fontWeight: 800,
  };
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
