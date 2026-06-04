// Sección comparativa "Seguimiento de crecimiento" — modelo tipo tablero
// Shopify reutilizable por /radar y /crecimiento. Default semanal: muestra
// período actual vs. período de comparación con KPIs, serie temporal con
// superposición y desglose top por miembro (entregadas e ingresadas).
//
// `formAction` permite que la sección viva en cualquier ruta sin perder los
// otros query params: el host pasa los nombres del granularity/current/comparison
// que usa y los inputs ocultos necesarios para preservar su propio estado
// (por ejemplo el `?period=` mensual del Radar).
//
// Mantenemos la capa de datos en `_lib/crecimiento-data.ts`; este archivo es
// puramente presentacional.
import Link from "next/link";
import { COLORS } from "../_lib/tokens";
import type {
  Comparativo,
  ComparativoBucket,
  ComparativoKpi,
  ComparativoMemberRow,
  ComparativoRateKpi,
} from "../_lib/crecimiento-data";

export interface ComparativoSectionProps {
  comparativo: Comparativo;
  // URL a la que apuntan los formularios de selección de granularidad y
  // período (típicamente la misma ruta donde vive la sección).
  formAction: string;
  // Inputs ocultos extra que se agregan al form: sirven para preservar otros
  // query params del host (p. ej. `?period=` del Radar mensual) cuando se
  // cambia la granularidad o el período comparativo.
  extraHiddenInputs?: ReadonlyArray<{ name: string; value: string }>;
  // Título de la cabecera. Default: "Seguimiento de crecimiento".
  title?: string;
  // Sub-eyebrow corto. Default: "Crecimiento vs. comparación".
  eyebrow?: string;
  // Si true, agrega un link de drill-down al final de la sección.
  drillDownHref?: string;
  drillDownLabel?: string;
  // Si true, oculta los controles manuales (granularidad / período /
  // comparación). Se usa cuando el host ya monta un filtro único arriba
  // (RadarPeriodFiltro) y la comparación es automática contra el período
  // anterior.
  hideControls?: boolean;
}

export function ComparativoSection({
  comparativo,
  formAction,
  extraHiddenInputs,
  title = "Seguimiento de crecimiento",
  eyebrow = "Crecimiento vs. comparación",
  drillDownHref,
  drillDownLabel,
  hideControls = false,
}: ComparativoSectionProps) {
  const granularityLabel =
    comparativo.granularity === "weekly" ? "Semanal" : "Mensual";
  const compLabel = comparativo.comparison
    ? comparativo.comparison.label
    : "sin período anterior";

  return (
    <section
      aria-label="Seguimiento de crecimiento"
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
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <p style={eyebrowStyle()}>{eyebrow}</p>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: COLORS.textSoft,
              lineHeight: 1.45,
            }}
          >
            {comparativo.current.label}{" "}
            <span style={{ color: COLORS.textMuted, fontWeight: 500 }}>
              vs. {compLabel}
            </span>
            {" · "}
            Granularidad: {granularityLabel}
            {comparativo.granularity === "weekly"
              ? " (default semanal: semana actual vs. semana anterior. Cambiá a mensual si necesitás granularidad de cierre)."
              : " (vista mensual)."}
          </p>
        </div>
        {hideControls ? null : (
          <ComparativoControls
            comparativo={comparativo}
            formAction={formAction}
            extraHiddenInputs={extraHiddenInputs}
          />
        )}
      </header>

      <KpiRow kpis={comparativo.kpis} comparativo={comparativo} />

      <TimeSeriesOverlay
        currentSeries={comparativo.currentSeries}
        comparisonSeries={comparativo.comparisonSeries}
        currentLabel={comparativo.current.label}
        comparisonLabel={comparativo.comparison?.label ?? null}
      />

      <div style={twoColStyle()}>
        <MemberBreakdownCard
          title="Top por entregas"
          subtitle="Quién entregó más en el período (eje del negocio)"
          rows={comparativo.topDelivered}
          metric="delivered"
        />
        <MemberBreakdownCard
          title="Top por ingresadas"
          subtitle="Quién ingresó más órdenes en el período"
          rows={comparativo.topEntered}
          metric="entered"
        />
      </div>

      {drillDownHref ? (
        <div style={{ marginTop: 12 }}>
          <Link
            href={drillDownHref}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: COLORS.brand,
              textDecoration: "underline",
            }}
          >
            {drillDownLabel ?? "Ver más en Crecimiento →"}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ComparativoControls({
  comparativo,
  formAction,
  extraHiddenInputs,
}: {
  comparativo: Comparativo;
  formAction: string;
  extraHiddenInputs?: ReadonlyArray<{ name: string; value: string }>;
}) {
  const isWeekly = comparativo.granularity === "weekly";
  const comparisonModeLabel = isWeekly
    ? "Comparación semanal"
    : "Comparación mensual";
  const principalLabel = isWeekly ? "Semana principal" : "Mes principal";
  return (
    <form
      method="get"
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      {extraHiddenInputs?.map((h, i) => (
        <input
          key={`${h.name}-${i}`}
          type="hidden"
          name={h.name}
          value={h.value}
        />
      ))}
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 800,
          color: COLORS.text,
        }}
      >
        {comparisonModeLabel}
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <SelectField
          name="granularity"
          label="Ver"
          defaultValue={comparativo.granularity}
        >
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
        </SelectField>
        <SelectField
          name="current"
          label={principalLabel}
          defaultValue={comparativo.current.key}
        >
          {comparativo.available.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="comparison"
          label="Comparar con"
          defaultValue={comparativo.comparison?.key ?? ""}
        >
          <option value="">Sin comparación</option>
          {comparativo.available
            .filter((p) => p.key !== comparativo.current.key)
            .map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
        </SelectField>
        <button type="submit" style={primaryButtonStyle()}>
          Aplicar
        </button>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: COLORS.textMuted,
          lineHeight: 1.45,
          maxWidth: 320,
        }}
      >
        Para comparar semanas: dejá Ver = Semanal, elegí Semana principal y
        Comparar con, luego Aplicar.
      </p>
    </form>
  );
}

function KpiRow({
  kpis,
  comparativo,
}: {
  kpis: Comparativo["kpis"];
  comparativo: Comparativo;
}) {
  return (
    <div style={kpiGridStyle()}>
      <KpiCard
        label="Entregas"
        kpi={kpis.delivered}
        sparklineSeries={comparativo.currentSeries}
        sparklineKey="ordersDelivered"
        hero
      />
      <KpiCard
        label="Órdenes ingresadas"
        kpi={kpis.entered}
        sparklineSeries={comparativo.currentSeries}
        sparklineKey="ordersEntered"
      />
      <KpiCard
        label="Devoluciones"
        kpi={kpis.returned}
        sparklineSeries={comparativo.currentSeries}
        sparklineKey="ordersReturned"
        accent="inverse"
      />
      <RateKpiCard
        label="Conversión entrega/ingresadas"
        kpi={kpis.deliveryRate}
        hint="entregadas ÷ ingresadas"
      />
      <RateKpiCard
        label="Entrega operativa"
        kpi={kpis.deliveryRateOperational}
        hint="entregadas ÷ movidas"
      />
    </div>
  );
}

function KpiCard({
  label,
  kpi,
  sparklineSeries,
  sparklineKey,
  hero,
  accent,
}: {
  label: string;
  kpi: ComparativoKpi;
  sparklineSeries: ComparativoBucket[];
  sparklineKey: keyof ComparativoBucket["totals"];
  hero?: boolean;
  accent?: "normal" | "inverse";
}) {
  const direction = accent ?? "normal";
  const showDelta = kpi.deltaPct != null && Number.isFinite(kpi.deltaPct);
  const positive = (kpi.deltaPct ?? 0) >= 0;
  const goodColor = direction === "inverse" ? COLORS.danger : COLORS.success;
  const badColor = direction === "inverse" ? COLORS.success : COLORS.danger;
  const deltaColor = positive ? goodColor : badColor;
  const values = sparklineSeries.map((b) => b.totals[sparklineKey]);
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${hero ? COLORS.brand : COLORS.border}`,
        borderRadius: 12,
        padding: 14,
        boxShadow: hero ? "0 1px 0 rgba(224,58,24,0.08)" : "none",
      }}
    >
      <p style={eyebrowStyle()}>{label}</p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: hero ? 28 : 22,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {kpi.current.toLocaleString("es-CO")}
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
          {positive ? "▲" : "▼"} {Math.abs(kpi.deltaPct as number)}% vs.
          comparación
        </p>
      ) : kpi.comparison != null ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Comparación: {kpi.comparison.toLocaleString("es-CO")}
        </p>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Sin período de comparación
        </p>
      )}
      <Sparkline values={values} stroke={hero ? COLORS.brand : "#475569"} />
    </div>
  );
}

function RateKpiCard({
  label,
  kpi,
  hint,
}: {
  label: string;
  kpi: ComparativoRateKpi;
  hint?: string;
}) {
  const showDelta = kpi.deltaPts != null && Number.isFinite(kpi.deltaPts);
  const positive = (kpi.deltaPts ?? 0) >= 0;
  const deltaColor = positive ? COLORS.success : COLORS.danger;
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <p style={eyebrowStyle()}>{label}</p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        {kpi.current}%
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
          {positive ? "▲" : "▼"} {Math.abs(kpi.deltaPts as number).toFixed(2)} pts vs.
          comparación
        </p>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Sin período de comparación
        </p>
      )}
      {hint ? (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: COLORS.textMuted,
            fontStyle: "italic",
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Sparkline({
  values,
  stroke,
}: {
  values: number[];
  stroke: string;
}) {
  if (values.length < 2) {
    return (
      <div
        style={{
          height: 28,
          marginTop: 8,
          fontSize: 10,
          color: COLORS.textMuted,
        }}
      >
        Sin serie suficiente
      </div>
    );
  }
  const w = 120;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      style={{ marginTop: 8, display: "block" }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TimeSeriesOverlay({
  currentSeries,
  comparisonSeries,
  currentLabel,
  comparisonLabel,
}: {
  currentSeries: ComparativoBucket[];
  comparisonSeries: ComparativoBucket[];
  currentLabel: string;
  comparisonLabel: string | null;
}) {
  if (currentSeries.length === 0) {
    return (
      <div
        style={{
          marginTop: 14,
          padding: 14,
          backgroundColor: COLORS.background,
          borderRadius: 10,
          fontSize: 12,
          color: COLORS.textMuted,
          textAlign: "center",
        }}
      >
        Sin serie temporal disponible para el período actual.
      </div>
    );
  }
  const w = 760;
  const h = 180;
  const pad = { top: 18, right: 12, bottom: 28, left: 36 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const allValues = [
    ...currentSeries.map((b) => b.totals.ordersDelivered),
    ...comparisonSeries.map((b) => b.totals.ordersDelivered),
  ];
  const max = Math.max(...allValues, 1);
  const bucketCount = Math.max(
    currentSeries.length,
    comparisonSeries.length,
  );
  const stepX = innerW / Math.max(1, bucketCount - 1);
  const toCoords = (series: ComparativoBucket[]) =>
    series.map((b, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + (1 - b.totals.ordersDelivered / max) * innerH;
      return { x, y, label: b.label, value: b.totals.ordersDelivered };
    });
  const currentPoints = toCoords(currentSeries);
  const comparisonPoints = toCoords(comparisonSeries);
  const currentPath = currentPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const comparisonPath = comparisonPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        backgroundColor: COLORS.background,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <p style={eyebrowStyle()}>Entregadas en el tiempo</p>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: COLORS.textSoft,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 18,
              height: 2,
              backgroundColor: COLORS.brand,
              display: "inline-block",
            }}
          />
          Período actual ({currentLabel})
        </span>
        {comparisonLabel ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: COLORS.textSoft,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 2,
                background:
                  "repeating-linear-gradient(to right, #94A3B8 0 4px, transparent 4px 8px)",
                display: "inline-block",
              }}
            />
            Comparación ({comparisonLabel})
          </span>
        ) : null}
      </div>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Serie temporal de entregadas con superposición"
      >
        <line
          x1={pad.left}
          x2={w - pad.right}
          y1={h - pad.bottom}
          y2={h - pad.bottom}
          stroke={COLORS.border}
          strokeWidth={1}
        />
        {comparisonPath ? (
          <path
            d={comparisonPath}
            fill="none"
            stroke="#94A3B8"
            strokeWidth={1.6}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        <path
          d={currentPath}
          fill="none"
          stroke={COLORS.brand}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {currentPoints.map((p, i) => (
          <g key={`c-${i}`}>
            <circle cx={p.x} cy={p.y} r={3} fill={COLORS.brand} />
            <title>
              {p.label}: {p.value.toLocaleString("es-CO")} entregadas (actual)
            </title>
          </g>
        ))}
        {comparisonPoints.map((p, i) => (
          <g key={`cmp-${i}`}>
            <circle cx={p.x} cy={p.y} r={2.5} fill="#94A3B8" />
            <title>
              {p.label}: {p.value.toLocaleString("es-CO")} entregadas
              (comparación)
            </title>
          </g>
        ))}
        {currentSeries.map((b, i) => {
          const x = pad.left + i * stepX;
          return (
            <text
              key={`xl-${i}`}
              x={x}
              y={h - pad.bottom + 14}
              textAnchor="middle"
              fontSize={10}
              fill={COLORS.textMuted}
            >
              {b.label}
            </text>
          );
        })}
        <text
          x={pad.left - 4}
          y={pad.top + 4}
          textAnchor="end"
          fontSize={10}
          fill={COLORS.textMuted}
        >
          {max.toLocaleString("es-CO")}
        </text>
        <text
          x={pad.left - 4}
          y={h - pad.bottom}
          textAnchor="end"
          fontSize={10}
          fill={COLORS.textMuted}
        >
          0
        </text>
      </svg>
    </div>
  );
}

function MemberBreakdownCard({
  title,
  subtitle,
  rows,
  metric,
}: {
  title: string;
  subtitle: string;
  rows: ComparativoMemberRow[];
  metric: "entered" | "delivered";
}) {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <p style={eyebrowStyle()}>{title}</p>
      <p
        style={{
          margin: "4px 0 10px",
          fontSize: 12,
          color: COLORS.textSoft,
        }}
      >
        {subtitle}
      </p>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>
          Sin actividad registrada en el período.
        </p>
      ) : (
        <ul style={listStyle()}>
          {rows.map((m) => {
            const value =
              metric === "delivered"
                ? m.current.ordersDelivered
                : m.current.ordersEntered;
            const delta =
              metric === "delivered" ? m.deliveredDelta : m.enteredDelta;
            const positive = (delta ?? 0) >= 0;
            return (
              <li key={m.id} style={listItemStyle()}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/comunidad-dropi/miembros/${m.id}`}
                    style={memberLinkStyle()}
                  >
                    {m.fullName ?? "Sin nombre"}
                  </Link>
                  <span
                    style={{
                      display: "block",
                      color: COLORS.textMuted,
                      fontSize: 11,
                    }}
                  >
                    {m.country ?? "Sin país"} ·{" "}
                    {metric === "delivered"
                      ? `${m.current.ordersEntered.toLocaleString("es-CO")} ingresadas`
                      : `${m.current.ordersDelivered.toLocaleString("es-CO")} entregadas`}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: COLORS.text,
                    }}
                  >
                    {value.toLocaleString("es-CO")}
                  </span>
                  {delta != null ? (
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 700,
                        color: positive ? COLORS.success : COLORS.danger,
                      }}
                    >
                      {positive ? "▲" : "▼"} {Math.abs(delta).toLocaleString("es-CO")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SelectField({
  name,
  defaultValue,
  children,
  ariaLabel,
  label,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
  ariaLabel?: string;
  label?: string;
}) {
  const select = (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={label ? undefined : ariaLabel}
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
  );

  if (!label) {
    return select;
  }

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
      {select}
    </label>
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

function kpiGridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  };
}

function twoColStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12,
    marginTop: 14,
  };
}

function listStyle(): React.CSSProperties {
  return { listStyle: "none", margin: 0, padding: 0 };
}

function listItemStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderBottom: `1px solid ${COLORS.border}`,
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
