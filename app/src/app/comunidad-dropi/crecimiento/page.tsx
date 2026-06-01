// /comunidad-dropi/crecimiento — Seguimiento de crecimiento de la comunidad.
//
// Una sola vista responde dos preguntas:
//   1) ¿Crecimos o decrecimos vs. el período de comparación?
//      → Modelo comparativo estilo tablero Shopify, default semanal.
//   2) ¿Quién está creciendo, quién está cayendo y quiénes son los top?
//      → Tres cohortes mensuales sobre `ordersDelivered`:
//         - Top 20 por entregas.
//         - Cohorte en caída (alerta) con previo >= 50 y delta negativo.
//         - Cohorte de crecimiento por bandas 10/20/30 con actual >= 50.
//
// Reglas duras respetadas:
//   - No tocar pipeline de importación: la cohorte en caída expone un CTA
//     server-action que crea el seguimiento DROP, no se cambia el confirm.
//   - Motor weekly (`comunidad-dropi-segments.ts`) sigue intacto.
//   - Cohortes 10/20/30 viven en el motor mensual / radar.
//   - UI en español.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import {
  buildDeclineCohort,
  buildGrowthCohorts,
  buildTopDelivered,
  DROPI_RADAR_THRESHOLDS,
  type DeclineCohortMember,
  type GrowthCohortBucket,
  type RadarMember,
} from "@/lib/comunidad-dropi-radar";
import {
  loadComparativo,
  loadMonthlyRadar,
  listMonthlyPeriodsForUi,
  type Comparativo,
  type ComparativoBucket,
  type ComparativoKpi,
  type ComparativoMemberRow,
  type ComparativoRateKpi,
  type Granularity,
  type PeriodMonthly,
} from "../_lib/crecimiento-data";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import { openDeliveredDropFollowUp } from "./actions";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parseGranularity(value: string | undefined): Granularity {
  return value === "monthly" ? "monthly" : "weekly";
}

export default async function CrecimientoPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const granularity = parseGranularity(sp.granularity);
  const currentKey = sp.current ?? null;
  const comparisonKey = sp.comparison ?? null;
  const monthKey = sp.cohortMonth ?? null;

  const [comparativo, monthlyPeriods] = await Promise.all([
    loadComparativo({ granularity, currentKey, comparisonKey }),
    listMonthlyPeriodsForUi(),
  ]);
  const cohortLoad = await loadMonthlyRadar(monthKey, monthlyPeriods);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {comparativo == null && cohortLoad.radar == null ? (
        <EmptyState />
      ) : (
        <>
          {comparativo ? (
            <ComparativoSection comparativo={comparativo} />
          ) : (
            <SectionEmpty
              title="Modelo comparativo"
              text="Aún no hay períodos cargados para comparar. Importa al menos un cierre semanal o mensual."
            />
          )}
          {cohortLoad.radar && cohortLoad.current ? (
            <CohortesSection
              members={cohortLoad.radar.members}
              availableMonths={cohortLoad.available}
              currentMonth={cohortLoad.current}
              granularity={granularity}
              currentKey={comparativo?.current.key ?? null}
              comparisonKey={comparativo?.comparison?.key ?? null}
            />
          ) : (
            <SectionEmpty
              title="Cohortes mensuales"
              text="No hay cierre mensual confirmado todavía. Importa un reporte mensual para activar las cohortes."
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Header / Empty ────────────────────────────────────────────────────────

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Crecimiento</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Seguimiento de crecimiento
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Lectura comparativa estilo tablero y cohortes mensuales calculadas sobre
        entregas. Las bandas 10 / 20 / 30 % y el umbral de cohorte (
        {DROPI_RADAR_THRESHOLDS.deliveredCohortMin} entregas) viven en el motor
        mensual; el motor semanal no se toca.
      </p>
    </header>
  );
}

function EmptyState() {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
        Aún no hay datos cargados
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 520,
        }}
      >
        Importa al menos un cierre semanal o mensual de Dropi para activar el
        comparativo y las cohortes de crecimiento.
      </p>
      <Link
        href="/comunidad-dropi/importaciones"
        style={primaryLinkStyle()}
      >
        Ir a Importaciones
      </Link>
    </section>
  );
}

function SectionEmpty({ title, text }: { title: string; text: string }) {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 12,
        padding: 18,
        marginBottom: 18,
      }}
    >
      <p style={eyebrowStyle()}>{title}</p>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 13,
        }}
      >
        {text}
      </p>
    </section>
  );
}

// ─── Comparativo (Shopify-style) ───────────────────────────────────────────

function ComparativoSection({ comparativo }: { comparativo: Comparativo }) {
  const granularityLabel =
    comparativo.granularity === "weekly" ? "Semanal" : "Mensual";
  const compLabel = comparativo.comparison
    ? comparativo.comparison.label
    : "—";
  return (
    <section
      aria-label="Modelo comparativo"
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
          <p style={eyebrowStyle()}>Modelo comparativo</p>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            {comparativo.current.label}{" "}
            <span style={{ color: COLORS.textSoft, fontWeight: 600 }}>
              vs. {compLabel}
            </span>
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: COLORS.textMuted,
            }}
          >
            Granularidad: {granularityLabel}. Default semanal — cambia a
            mensual para granularidad de cierre.
          </p>
        </div>
        <ComparativoControls comparativo={comparativo} />
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
          title="Más ingresadas"
          subtitle="Top miembros por órdenes ingresadas en el período"
          rows={comparativo.topEntered}
          metric="entered"
        />
        <MemberBreakdownCard
          title="Más entregadas"
          subtitle="Top miembros por entregas en el período (eje del negocio)"
          rows={comparativo.topDelivered}
          metric="delivered"
        />
      </div>
    </section>
  );
}

function ComparativoControls({ comparativo }: { comparativo: Comparativo }) {
  return (
    <form
      method="get"
      action="/comunidad-dropi/crecimiento"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      <SelectField name="granularity" defaultValue={comparativo.granularity}>
        <option value="weekly">Semanal</option>
        <option value="monthly">Mensual</option>
      </SelectField>
      <SelectField
        name="current"
        defaultValue={comparativo.current.key}
        ariaLabel="Período principal"
      >
        {comparativo.available.map((p) => (
          <option key={p.key} value={p.key}>
            Actual: {p.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        name="comparison"
        defaultValue={comparativo.comparison?.key ?? ""}
        ariaLabel="Período de comparación"
      >
        <option value="">Sin comparación</option>
        {comparativo.available
          .filter((p) => p.key !== comparativo.current.key)
          .map((p) => (
            <option key={p.key} value={p.key}>
              Comparar con: {p.label}
            </option>
          ))}
      </SelectField>
      <button type="submit" style={primaryButtonStyle()}>
        Aplicar
      </button>
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
        label="Entregadas"
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

// Sparkline minimalista en SVG. Genera la polilínea con coordenadas
// normalizadas; sin tooltips ni puntos para mantener la tarjeta liviana.
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
      const y =
        pad.top + (1 - b.totals.ordersDelivered / max) * innerH;
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
                    {m.current.ordersEntered.toLocaleString("es-CO")} ingresadas
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

// ─── Cohortes mensuales ─────────────────────────────────────────────────────

function CohortesSection({
  members,
  availableMonths,
  currentMonth,
  granularity,
  currentKey,
  comparisonKey,
}: {
  members: RadarMember[];
  availableMonths: PeriodMonthly[];
  currentMonth: PeriodMonthly;
  granularity: Granularity;
  currentKey: string | null;
  comparisonKey: string | null;
}) {
  const top = buildTopDelivered(members, DROPI_RADAR_THRESHOLDS.topDeliveredLimit);
  const decline = buildDeclineCohort(members);
  const growth = buildGrowthCohorts(members);

  return (
    <section
      aria-label="Cohortes mensuales"
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
          <p style={eyebrowStyle()}>Cohortes mensuales</p>
          <h2
            style={{
              margin: "2px 0 0",
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            Mes: {currentMonth.label}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: COLORS.textMuted,
            }}
          >
            Filtros: entregas (≥ {DROPI_RADAR_THRESHOLDS.deliveredCohortMin}) y
            comparación contra el mes anterior cargado.
          </p>
        </div>
        <CohortMonthControls
          availableMonths={availableMonths}
          currentMonth={currentMonth}
          granularity={granularity}
          currentKey={currentKey}
          comparisonKey={comparisonKey}
        />
      </header>

      <TopDeliveredTable members={top} />
      <div style={{ height: 14 }} />
      <DeclineCohortTable rows={decline} />
      <div style={{ height: 14 }} />
      <GrowthCohortsBlock buckets={growth} />
    </section>
  );
}

function CohortMonthControls({
  availableMonths,
  currentMonth,
  granularity,
  currentKey,
  comparisonKey,
}: {
  availableMonths: PeriodMonthly[];
  currentMonth: PeriodMonthly;
  granularity: Granularity;
  currentKey: string | null;
  comparisonKey: string | null;
}) {
  if (availableMonths.length <= 1) {
    return null;
  }
  return (
    <form
      method="get"
      action="/comunidad-dropi/crecimiento"
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <input type="hidden" name="granularity" value={granularity} />
      {currentKey ? <input type="hidden" name="current" value={currentKey} /> : null}
      {comparisonKey ? (
        <input type="hidden" name="comparison" value={comparisonKey} />
      ) : null}
      <SelectField
        name="cohortMonth"
        defaultValue={currentMonth.key}
        ariaLabel="Mes para cohortes"
      >
        {availableMonths.map((p) => (
          <option key={p.key} value={p.key}>
            Mes cohortes: {p.label}
          </option>
        ))}
      </SelectField>
      <button type="submit" style={primaryButtonStyle()}>
        Aplicar
      </button>
    </form>
  );
}

function TopDeliveredTable({ members }: { members: RadarMember[] }) {
  return (
    <CohortCard title={`Top ${members.length} por entregas`}>
      {members.length === 0 ? (
        <EmptyText text="Sin miembros con entregas en este mes." />
      ) : (
        <Table
          headers={["#", "Miembro", "Entregas", "Ingresadas", "Devoluciones", "Δ entregas vs. mes previo"]}
          rows={members.map((m, idx) => [
            String(idx + 1),
            <MemberLinkCell
              key="name"
              id={m.id}
              name={m.fullName}
              country={m.country}
            />,
            m.current.ordersDelivered.toLocaleString("es-CO"),
            m.current.ordersEntered.toLocaleString("es-CO"),
            m.current.ordersReturned.toLocaleString("es-CO"),
            <DeltaCell
              key="delta"
              abs={m.deliveredDelta}
              pct={m.deliveredDeltaPct}
            />,
          ])}
        />
      )}
    </CohortCard>
  );
}

function DeclineCohortTable({ rows }: { rows: DeclineCohortMember[] }) {
  return (
    <CohortCard
      title="Cohorte en caída (alerta · necesita ayuda)"
      badge={
        <span style={alertBadgeStyle()}>
          {rows.length} miembro{rows.length === 1 ? "" : "s"}
        </span>
      }
      subtitle={`Miembros con previo ≥ ${DROPI_RADAR_THRESHOLDS.deliveredCohortMin} entregas y delta negativo en este mes. Ordenados por pérdida absoluta.`}
    >
      {rows.length === 0 ? (
        <EmptyText text="Sin caídas relevantes este mes." />
      ) : (
        <Table
          headers={[
            "Miembro",
            "Entregas actuales",
            "Entregas previo",
            "Pérdida",
            "% caída",
            "Acción",
          ]}
          rows={rows.map((r) => [
            <MemberLinkCell
              key="name"
              id={r.member.id}
              name={r.member.fullName}
              country={r.member.country}
            />,
            r.member.current.ordersDelivered.toLocaleString("es-CO"),
            r.previousDelivered.toLocaleString("es-CO"),
            <span key="loss" style={{ color: COLORS.danger, fontWeight: 700 }}>
              {r.deliveredDelta.toLocaleString("es-CO")}
            </span>,
            r.deliveredDeltaPct != null ? (
              <span key="pct" style={{ color: COLORS.danger, fontWeight: 700 }}>
                {r.deliveredDeltaPct}%
              </span>
            ) : (
              <span key="pct" style={{ color: COLORS.textMuted }}>
                —
              </span>
            ),
            <OpenDropButton key="cta" memberId={r.member.id} />,
          ])}
        />
      )}
    </CohortCard>
  );
}

function GrowthCohortsBlock({ buckets }: { buckets: GrowthCohortBucket[] }) {
  const ordered = [...buckets].sort((a, b) => a.bandPct - b.bandPct);
  return (
    <CohortCard
      title="Cohorte de crecimiento"
      subtitle={`Miembros con ≥ ${DROPI_RADAR_THRESHOLDS.deliveredCohortMin} entregas en el mes, agrupados por banda de crecimiento vs. mes anterior. Cada miembro cae en la banda mayor cumplida.`}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {ordered.map((bucket) => (
          <div
            key={bucket.bandPct}
            style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: 12,
              backgroundColor: COLORS.background,
            }}
          >
            <p style={eyebrowStyle()}>
              Banda +{bucket.bandPct}% · {bucket.members.length} miembro
              {bucket.members.length === 1 ? "" : "s"}
            </p>
            {bucket.members.length === 0 ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
                Sin miembros en esta banda.
              </p>
            ) : (
              <ul style={{ ...listStyle(), marginTop: 8 }}>
                {bucket.members.map((g) => (
                  <li key={g.member.id} style={listItemStyle()}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link
                        href={`/comunidad-dropi/miembros/${g.member.id}`}
                        style={memberLinkStyle()}
                      >
                        {g.member.fullName ?? "Sin nombre"}
                      </Link>
                      <span
                        style={{
                          display: "block",
                          color: COLORS.textMuted,
                          fontSize: 11,
                        }}
                      >
                        {g.member.country ?? "—"} ·{" "}
                        {g.member.current.ordersDelivered.toLocaleString("es-CO")}{" "}
                        entregas
                      </span>
                    </div>
                    <span style={{ color: COLORS.success, fontWeight: 800 }}>
                      ▲ {g.deliveredDeltaPct}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </CohortCard>
  );
}

function OpenDropButton({ memberId }: { memberId: string }) {
  return (
    <form action={openDeliveredDropFollowUp}>
      <input type="hidden" name="memberId" value={memberId} />
      <input
        type="hidden"
        name="note"
        value="Generado desde cohorte de caída · entregas mensuales."
      />
      <button type="submit" style={ctaButtonStyle()}>
        Abrir DROP →
      </button>
    </form>
  );
}

// ─── Bloques pequeños y estilos ────────────────────────────────────────────

function CohortCard({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        backgroundColor: COLORS.background,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: subtitle ? 4 : 10,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 800,
            color: COLORS.text,
          }}
        >
          {title}
        </h3>
        {badge}
      </header>
      {subtitle ? (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
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
              <th
                key={i}
                style={{
                  padding: "8px 10px",
                  textAlign: "left",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: COLORS.textSoft,
                  borderBottom: `1px solid ${COLORS.border}`,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr
              key={ri}
              style={{
                backgroundColor:
                  ri % 2 === 0 ? COLORS.surface : COLORS.background,
              }}
            >
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${COLORS.border}`,
                    verticalAlign: "middle",
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberLinkCell({
  id,
  name,
  country,
}: {
  id: string;
  name: string | null;
  country: string | null;
}) {
  return (
    <span style={{ display: "block", minWidth: 160 }}>
      <Link
        href={`/comunidad-dropi/miembros/${id}`}
        style={memberLinkStyle()}
      >
        {name ?? "Sin nombre"}
      </Link>
      {country ? (
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: COLORS.textMuted,
          }}
        >
          {country}
        </span>
      ) : null}
    </span>
  );
}

function DeltaCell({
  abs,
  pct,
}: {
  abs: number | null;
  pct: number | null;
}) {
  if (abs == null && pct == null) {
    return <span style={{ color: COLORS.textMuted }}>—</span>;
  }
  const value = abs ?? 0;
  const positive = value >= 0;
  const color = positive ? COLORS.success : COLORS.danger;
  return (
    <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
      {positive ? "▲" : "▼"} {Math.abs(value).toLocaleString("es-CO")}
      {pct != null ? ` · ${Math.abs(pct)}%` : ""}
    </span>
  );
}

function SelectField({
  name,
  defaultValue,
  children,
  ariaLabel,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
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
}

function EmptyText({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>{text}</p>
  );
}

function alertBadgeStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    color: "#991B1B",
    fontSize: 11,
    fontWeight: 800,
  };
}

function ctaButtonStyle(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${COLORS.brand}`,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
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

function primaryLinkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    marginTop: 14,
    padding: "8px 14px",
    borderRadius: 8,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 13,
  };
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

