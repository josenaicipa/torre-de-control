import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  buildByCountry,
  buildBySegment,
  buildFunnel,
  buildMonthlyTrend,
  buildOverview,
  buildWeeklyTrend,
  rankOpportunities,
  ratesFromTotals,
  type FunnelStage,
  type MemberOpportunityInput,
  type OverviewMemberSnapshot,
  type TrendBucket,
} from "@/lib/comunidad-dropi-analytics";
import {
  COLORS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
} from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

const WEEKLY_LIMIT = 8;
const MONTHLY_LIMIT = 6;
const OPPORTUNITIES_LIMIT = 10;

export default async function InteligenciaPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const data = await loadIntelligenceData();

  if (data.isEmpty) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
        <Header />
        <SubNav />
        <EmptyState />
      </div>
    );
  }

  const {
    overview,
    weeklyBuckets,
    monthlyBuckets,
    countryBuckets,
    segmentBuckets,
    opportunities,
    latestPeriod,
    previousPeriod,
  } = data;

  const funnel = buildFunnel(overview.current.totals);
  const enteredSeries = weeklyBuckets.map((b) => b.totals.ordersEntered);
  const movedSeries = weeklyBuckets.map((b) => b.totals.ordersMoved);
  const deliveredSeries = weeklyBuckets.map((b) => b.totals.ordersDelivered);
  const returnedSeries = weeklyBuckets.map((b) => b.totals.ordersReturned);
  const movementRateSeries = weeklyBuckets.map((b) => b.rates.movementRate);
  const deliveryRateSeries = weeklyBuckets.map((b) => b.rates.deliveryRate);
  const returnRateSeries = weeklyBuckets.map((b) => b.rates.returnRate);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />

      <PeriodToolbar
        latestPeriod={latestPeriod}
        previousPeriod={previousPeriod}
      />

      <section style={kpiGridStyle()} aria-label="Indicadores principales">
        <Kpi
          label="Pedidos ingresados"
          value={overview.current.totals.ordersEntered}
          delta={overview.deltas?.ordersEntered.pct ?? null}
          spark={enteredSeries}
          sparkColor={SERIES_COLORS.entered}
        />
        <Kpi
          label="Pedidos movidos"
          value={overview.current.totals.ordersMoved}
          delta={overview.deltas?.ordersMoved.pct ?? null}
          spark={movedSeries}
          sparkColor={SERIES_COLORS.moved}
        />
        <Kpi
          label="Entregados"
          value={overview.current.totals.ordersDelivered}
          delta={overview.deltas?.ordersDelivered.pct ?? null}
          spark={deliveredSeries}
          sparkColor={SERIES_COLORS.delivered}
        />
        <Kpi
          label="Devueltos"
          value={overview.current.totals.ordersReturned}
          delta={overview.deltas?.ordersReturned.pct ?? null}
          accentDirection="inverse"
          spark={returnedSeries}
          sparkColor={SERIES_COLORS.returned}
        />
        <Kpi
          label="Tasa de movimiento"
          value={`${overview.current.rates.movementRate}%`}
          delta={overview.deltas?.movementRate.pct ?? null}
          spark={movementRateSeries}
          sparkColor={SERIES_COLORS.moved}
        />
        <Kpi
          label="Entrega op. entregadas/movidas"
          value={`${overview.current.rates.deliveryRate}%`}
          delta={overview.deltas?.deliveryRate.pct ?? null}
          spark={deliveryRateSeries}
          sparkColor={SERIES_COLORS.delivered}
        />
        <Kpi
          label="Tasa de devolución"
          value={`${overview.current.rates.returnRate}%`}
          delta={overview.deltas?.returnRate.pct ?? null}
          accentDirection="inverse"
          spark={returnRateSeries}
          sparkColor={SERIES_COLORS.returned}
        />
        <Kpi
          label="Miembros activos"
          value={overview.activeMembers}
          sublabel={`${overview.totalMembers} en total`}
        />
      </section>

      <section style={{ marginBottom: 18 }}>
        <Card
          title="Tendencia semanal"
          subtitle="Pedidos por semana en las últimas 8. Pasá el cursor sobre cada punto para ver el valor."
        >
          {weeklyBuckets.length === 0 ? (
            <EmptyText text="Sin tendencia semanal aún." />
          ) : (
            <>
              <MultiLineChart buckets={weeklyBuckets} />
              <details style={detailsStyle()}>
                <summary style={summaryStyle()}>Ver tabla resumida</summary>
                <div style={{ marginTop: 10 }}>
                  <TrendTable buckets={weeklyBuckets} labelHeader="Semana" />
                </div>
              </details>
            </>
          )}
        </Card>
      </section>

      <section style={twoColStyle()}>
        <Card
          title="Funnel operativo"
          subtitle="Del ingreso a la entrega en el último cierre. Las devueltas son fuga sobre las movidas."
        >
          {overview.current.totals.ordersEntered === 0 ? (
            <EmptyText text="Sin pedidos en el último cierre." />
          ) : (
            <Funnel stages={funnel} />
          )}
        </Card>
        <Card
          title="Distribución por segmento"
          subtitle="Cómo se reparte la comunidad hoy."
        >
          {segmentBuckets.length === 0 ? (
            <EmptyText text="Sin segmentos calculados." />
          ) : (
            <SegmentBars rows={segmentBuckets} />
          )}
        </Card>
      </section>

      <section style={twoColStyle()}>
        <Card
          title="Ranking por país"
          subtitle="Miembros por país y su entrega operativa."
        >
          {countryBuckets.length === 0 ? (
            <EmptyText text="Sin datos por país." />
          ) : (
            <CountryBars rows={countryBuckets} />
          )}
        </Card>
        <Card
          title="Tendencia mensual"
          subtitle="Ingresadas vs. entregadas por mes (últimos 6)."
        >
          {monthlyBuckets.length === 0 ? (
            <EmptyText text="Sin tendencia mensual aún." />
          ) : (
            <>
              <MonthlyBars buckets={monthlyBuckets} />
              <details style={detailsStyle()}>
                <summary style={summaryStyle()}>Ver tabla resumida</summary>
                <div style={{ marginTop: 10 }}>
                  <TrendTable buckets={monthlyBuckets} labelHeader="Mes" />
                </div>
              </details>
            </>
          )}
        </Card>
      </section>

      <section style={{ marginTop: 18 }}>
        <Card
          title="Oportunidades prioritarias"
          subtitle="Casos a accionar primero, ordenados por impacto."
        >
          {opportunities.length === 0 ? (
            <EmptyText text="No hay oportunidades para mostrar." />
          ) : (
            <OpportunityList rows={opportunities} />
          )}
        </Card>
      </section>
    </div>
  );
}

const SERIES_COLORS = {
  entered: "#2563EB",
  moved: "#7C3AED",
  delivered: COLORS.success,
  returned: COLORS.danger,
} as const;

interface IntelligenceData {
  isEmpty: boolean;
  overview: ReturnType<typeof buildOverview>;
  weeklyBuckets: TrendBucket[];
  monthlyBuckets: TrendBucket[];
  countryBuckets: ReturnType<typeof buildByCountry>;
  segmentBuckets: ReturnType<typeof buildBySegment>;
  opportunities: ReturnType<typeof rankOpportunities>;
  latestPeriod: { periodStart: Date; periodEnd: Date } | null;
  previousPeriod: { periodStart: Date; periodEnd: Date } | null;
}

async function loadIntelligenceData(): Promise<IntelligenceData> {
  const totalMembers = await prisma.dropiCommunityMember.count();
  if (totalMembers === 0) {
    return emptyData();
  }

  const weeklyPeriods = await prisma.dropiWeeklyMetric.groupBy({
    by: ["periodStart", "periodEnd"],
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    take: WEEKLY_LIMIT,
  });

  const monthlyPeriods = await prisma.dropiMonthlyMetric.groupBy({
    by: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: MONTHLY_LIMIT,
  });

  const latestPeriod = weeklyPeriods[0]
    ? {
        periodStart: weeklyPeriods[0].periodStart,
        periodEnd: weeklyPeriods[0].periodEnd,
      }
    : null;
  const previousPeriod = weeklyPeriods[1]
    ? {
        periodStart: weeklyPeriods[1].periodStart,
        periodEnd: weeklyPeriods[1].periodEnd,
      }
    : null;

  const weeklyPeriodKeys = weeklyPeriods.map((p) => ({
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
  }));
  const monthlyPeriodKeys = monthlyPeriods.map((p) => ({
    year: p.year,
    month: p.month,
  }));

  const [
    members,
    currentRows,
    previousRows,
    weeklyRows,
    monthlyRows,
    countryLatestRows,
  ] = await Promise.all([
    prisma.dropiCommunityMember.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        country: true,
        currentSegment: true,
        currentPriority: true,
        currentStatus: true,
        linkedStudentId: true,
      },
    }),
    latestPeriod
      ? prisma.dropiWeeklyMetric.findMany({
          where: {
            periodStart: latestPeriod.periodStart,
            periodEnd: latestPeriod.periodEnd,
          },
          select: {
            memberId: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
            deltaOrdersPercent: true,
          },
        })
      : Promise.resolve([]),
    previousPeriod
      ? prisma.dropiWeeklyMetric.findMany({
          where: {
            periodStart: previousPeriod.periodStart,
            periodEnd: previousPeriod.periodEnd,
          },
          select: {
            memberId: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
    weeklyPeriodKeys.length > 0
      ? prisma.dropiWeeklyMetric.findMany({
          where: { OR: weeklyPeriodKeys },
          select: {
            memberId: true,
            periodStart: true,
            periodEnd: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
    monthlyPeriodKeys.length > 0
      ? prisma.dropiMonthlyMetric.findMany({
          where: { OR: monthlyPeriodKeys },
          select: {
            memberId: true,
            year: true,
            month: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
    latestPeriod
      ? prisma.dropiWeeklyMetric.findMany({
          where: {
            periodStart: latestPeriod.periodStart,
            periodEnd: latestPeriod.periodEnd,
          },
          select: {
            country: true,
            ordersEntered: true,
            ordersMoved: true,
            ordersDelivered: true,
            ordersReturned: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const memberSnapshots: OverviewMemberSnapshot[] = members.map((m) => ({
    currentSegment: m.currentSegment,
    currentPriority: m.currentPriority,
    currentStatus: m.currentStatus,
    linkedStudentId: m.linkedStudentId,
    country: m.country,
  }));

  const overview = buildOverview({
    members: memberSnapshots,
    currentRows: currentRows.map((r) => ({
      ordersEntered: r.ordersEntered,
      ordersMoved: r.ordersMoved,
      ordersDelivered: r.ordersDelivered,
      ordersReturned: r.ordersReturned,
    })),
    previousRows:
      previousRows.length > 0
        ? previousRows.map((r) => ({
            ordersEntered: r.ordersEntered,
            ordersMoved: r.ordersMoved,
            ordersDelivered: r.ordersDelivered,
            ordersReturned: r.ordersReturned,
          }))
        : null,
    currentMemberCount: new Set(currentRows.map((r) => r.memberId)).size,
    previousMemberCount: new Set(previousRows.map((r) => r.memberId)).size,
  });

  const weeklyBuckets = buildWeeklyTrend(weeklyRows);
  const monthlyBuckets = buildMonthlyTrend(monthlyRows);

  const countryBuckets = buildByCountry({
    members,
    rows: countryLatestRows,
  });

  const segmentBuckets = buildBySegment(members);

  const rowsByMember = new Map<
    string,
    {
      ordersEntered: number;
      ordersMoved: number;
      ordersDelivered: number;
      ordersReturned: number;
      deltaOrdersPercent: number | null;
    }
  >();
  for (const r of currentRows) {
    rowsByMember.set(r.memberId, {
      ordersEntered: r.ordersEntered,
      ordersMoved: r.ordersMoved,
      ordersDelivered: r.ordersDelivered,
      ordersReturned: r.ordersReturned,
      deltaOrdersPercent:
        r.deltaOrdersPercent == null ? null : Number(r.deltaOrdersPercent),
    });
  }

  const opportunityInputs: MemberOpportunityInput[] = members.map((m) => {
    const row = rowsByMember.get(m.id) ?? {
      ordersEntered: 0,
      ordersMoved: 0,
      ordersDelivered: 0,
      ordersReturned: 0,
      deltaOrdersPercent: null,
    };
    const rates = ratesFromTotals(row);
    return {
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      country: m.country,
      currentSegment: m.currentSegment,
      currentPriority: m.currentPriority,
      currentStatus: m.currentStatus,
      ordersEntered: row.ordersEntered,
      ordersMoved: row.ordersMoved,
      ordersDelivered: row.ordersDelivered,
      ordersReturned: row.ordersReturned,
      movementRate: rates.movementRate,
      deliveryRate: rates.deliveryRate,
      returnRate: rates.returnRate,
      deltaOrdersPercent: row.deltaOrdersPercent,
    };
  });

  const opportunities = rankOpportunities(
    opportunityInputs,
    OPPORTUNITIES_LIMIT,
  );

  return {
    isEmpty: false,
    overview,
    weeklyBuckets,
    monthlyBuckets,
    countryBuckets,
    segmentBuckets,
    opportunities,
    latestPeriod,
    previousPeriod,
  };
}

function emptyData(): IntelligenceData {
  return {
    isEmpty: true,
    overview: buildOverview({ members: [], currentRows: [] }),
    weeklyBuckets: [],
    monthlyBuckets: [],
    countryBuckets: [],
    segmentBuckets: [],
    opportunities: [],
    latestPeriod: null,
    previousPeriod: null,
  };
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p
        style={{
          margin: 0,
          color: COLORS.textMuted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Comunidad Dropi · Histórico
      </p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Análisis histórico
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Detalle histórico: tendencia semanal y mensual, distribución por país
        y segmento, y ranking automático de oportunidades. No es el pulso
        operativo vivo; para eso usá Radar. Esta pantalla es diagnóstico
        sobre los cierres ya cargados.
      </p>
    </header>
  );
}

function PeriodToolbar({
  latestPeriod,
  previousPeriod,
}: {
  latestPeriod: { periodStart: Date; periodEnd: Date } | null;
  previousPeriod: { periodStart: Date; periodEnd: Date } | null;
}) {
  if (!latestPeriod) {
    return (
      <p
        style={{
          margin: "0 0 18px",
          fontSize: 12,
          color: COLORS.textMuted,
        }}
      >
        Aún no hay reportes semanales cargados.
      </p>
    );
  }
  const current = formatRange(latestPeriod);
  const previous = previousPeriod ? formatRange(previousPeriod) : null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 18,
        backgroundColor: COLORS.background,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: COLORS.textMuted,
        }}
      >
        Período
      </span>
      <span style={periodPillStyle(true)}>{current}</span>
      {previous ? (
        <>
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>vs.</span>
          <span style={periodPillStyle(false)}>{previous}</span>
        </>
      ) : (
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
          Sin período previo para comparar
        </span>
      )}
      <span
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: COLORS.textMuted,
        }}
      >
        Automático sobre los últimos cierres cargados
      </span>
    </div>
  );
}

function periodPillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
    color: active ? COLORS.surface : COLORS.textSoft,
    backgroundColor: active ? COLORS.brand : COLORS.surface,
    border: `1px solid ${active ? COLORS.brand : COLORS.border}`,
  };
}

function formatRange(p: { periodStart: Date; periodEnd: Date }): string {
  return `${p.periodStart.toISOString().slice(0, 10)} → ${p.periodEnd.toISOString().slice(0, 10)}`;
}

function kpiGridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 18,
  };
}

function twoColStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 12,
    marginBottom: 18,
  };
}

function Kpi({
  label,
  value,
  delta,
  sublabel,
  accentDirection,
  spark,
  sparkColor,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  sublabel?: string;
  accentDirection?: "normal" | "inverse";
  spark?: number[];
  sparkColor?: string;
}) {
  const showDelta = delta != null && Number.isFinite(delta);
  const direction = accentDirection ?? "normal";
  const isPositive = (delta ?? 0) >= 0;
  const goodColor = direction === "inverse" ? COLORS.danger : COLORS.success;
  const badColor = direction === "inverse" ? COLORS.success : COLORS.danger;
  const deltaColor = isPositive ? goodColor : badColor;
  const deltaPrefix = isPositive ? "▲" : "▼";
  const hasSpark = spark != null && spark.length >= 2;
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: COLORS.textMuted,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 24,
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {typeof value === "number" ? value.toLocaleString("es-CO") : value}
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
          {deltaPrefix} {Math.abs(delta as number)}% vs. anterior
        </p>
      ) : sublabel ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          {sublabel}
        </p>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Sin período previo
        </p>
      )}
      {hasSpark ? (
        <Sparkline values={spark as number[]} stroke={sparkColor ?? COLORS.textSoft} />
      ) : null}
    </div>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const w = 120;
  const h = 26;
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
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
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

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: COLORS.textSoft,
        }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      ) : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function detailsStyle(): React.CSSProperties {
  return {
    marginTop: 12,
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 10,
  };
}

function summaryStyle(): React.CSSProperties {
  return {
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.brand,
  };
}

function EmptyText({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>{text}</p>
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
        Aún no hay datos para analizar
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        Sube un reporte de Dropi para que aparezcan KPIs, tendencias y
        oportunidades en esta pantalla.
      </p>
      <Link
        href="/comunidad-dropi/importaciones"
        style={{
          display: "inline-block",
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 8,
          backgroundColor: COLORS.brand,
          color: COLORS.surface,
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Ir a Importaciones
      </Link>
    </section>
  );
}

function TrendTable({
  buckets,
  labelHeader,
}: {
  buckets: TrendBucket[];
  labelHeader: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        role="grid"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead style={{ backgroundColor: COLORS.background }}>
          <tr>
            <Th>{labelHeader}</Th>
            <Th align="right">Ingresadas</Th>
            <Th align="right">Movidas</Th>
            <Th align="right">Entregadas</Th>
            <Th align="right">Devueltas</Th>
            <Th align="right">Δ ingresadas</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.key} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <Td>{b.label}</Td>
              <Td align="right">{b.totals.ordersEntered}</Td>
              <Td align="right">{b.totals.ordersMoved}</Td>
              <Td align="right">{b.totals.ordersDelivered}</Td>
              <Td align="right">{b.totals.ordersReturned}</Td>
              <Td align="right">
                <DeltaPill value={b.deltaEnteredPct} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiLineChart({ buckets }: { buckets: TrendBucket[] }) {
  const series = [
    { key: "ordersEntered" as const, label: "Ingresadas", color: SERIES_COLORS.entered },
    { key: "ordersMoved" as const, label: "Movidas", color: SERIES_COLORS.moved },
    { key: "ordersDelivered" as const, label: "Entregadas", color: SERIES_COLORS.delivered },
    { key: "ordersReturned" as const, label: "Devueltas", color: SERIES_COLORS.returned },
  ];

  const w = 760;
  const h = 220;
  const pad = { top: 16, right: 14, bottom: 34, left: 40 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const allValues = buckets.flatMap((b) =>
    series.map((s) => b.totals[s.key]),
  );
  const max = Math.max(...allValues, 1);
  const single = buckets.length === 1;
  const stepX = single ? 0 : innerW / (buckets.length - 1);
  const xAt = (i: number) =>
    single ? pad.left + innerW / 2 : pad.left + i * stepX;
  const yAt = (v: number) => pad.top + (1 - v / max) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <Legend items={series} />
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tendencia semanal de pedidos ingresados, movidos, entregados y devueltos"
        style={{ display: "block" }}
      >
        {gridLines.map((g, i) => {
          const y = pad.top + g * innerH;
          const value = Math.round(max * (1 - g));
          return (
            <g key={`grid-${i}`}>
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={y}
                y2={y}
                stroke={COLORS.border}
                strokeWidth={1}
              />
              <text
                x={pad.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill={COLORS.textMuted}
              >
                {value.toLocaleString("es-CO")}
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const points = buckets.map((b, i) => ({
            x: xAt(i),
            y: yAt(b.totals[s.key]),
            value: b.totals[s.key],
            label: b.label,
          }));
          const path = points
            .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.key}>
              {!single ? (
                <path
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {points.map((p, i) => (
                <g key={`${s.key}-${i}`}>
                  <circle cx={p.x} cy={p.y} r={3} fill={s.color} />
                  <title>
                    {p.label} · {s.label}: {p.value.toLocaleString("es-CO")}
                  </title>
                </g>
              ))}
            </g>
          );
        })}
        {buckets.map((b, i) => (
          <text
            key={`xl-${i}`}
            x={xAt(i)}
            y={h - pad.bottom + 16}
            textAnchor="middle"
            fontSize={10}
            fill={COLORS.textMuted}
          >
            {shortBucketLabel(b)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Legend({
  items,
}: {
  items: ReadonlyArray<{ label: string; color: string }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        marginBottom: 8,
      }}
    >
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            color: COLORS.textSoft,
            fontWeight: 600,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 14,
              height: 3,
              borderRadius: 2,
              backgroundColor: it.color,
              display: "inline-block",
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function shortBucketLabel(b: TrendBucket): string {
  // Semanal: key = "YYYY-MM-DD_YYYY-MM-DD" → "dd/mm". Mensual: usa el label
  // ("May 2026") que ya es corto.
  const start = b.key.split("_")[0];
  const parts = start.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return b.label;
}

function Funnel({ stages }: { stages: FunnelStage[] }) {
  const stageColors: Record<FunnelStage["key"], string> = {
    entered: SERIES_COLORS.entered,
    moved: SERIES_COLORS.moved,
    delivered: SERIES_COLORS.delivered,
    returned: SERIES_COLORS.returned,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {stages.map((s) => (
        <div key={s.key}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 4,
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
              {s.label}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: COLORS.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.value.toLocaleString("es-CO")}
              {s.conversionFromPrev != null ? (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color:
                      s.key === "returned"
                        ? COLORS.danger
                        : COLORS.textMuted,
                  }}
                >
                  {s.key === "returned" ? "fuga " : "conv. "}
                  {s.conversionFromPrev}%
                </span>
              ) : null}
            </span>
          </div>
          <div
            style={{
              height: 14,
              borderRadius: 7,
              backgroundColor: COLORS.background,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(2, s.shareOfEntered)}%`,
                height: "100%",
                backgroundColor: stageColors[s.key],
                borderRadius: 7,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SegmentBars({ rows }: { rows: ReturnType<typeof buildBySegment> }) {
  const maxShare = Math.max(...rows.map((r) => r.share), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => {
        const c = SEGMENT_COLORS[r.segment] ?? { bg: "#F1F5F9", text: "#475569" };
        return (
          <div key={r.segment}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <SegmentBadge segment={r.segment} />
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.textSoft,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {r.memberCount} · {r.share}%
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 5,
                backgroundColor: COLORS.background,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, (r.share / maxShare) * 100)}%`,
                  height: "100%",
                  backgroundColor: c.text,
                  borderRadius: 5,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CountryBars({ rows }: { rows: ReturnType<typeof buildByCountry> }) {
  const top = rows.slice(0, 8);
  const maxMembers = Math.max(...top.map((r) => r.memberCount), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {top.map((r) => (
        <div key={r.country}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
              {r.country}
            </span>
            <span
              style={{
                fontSize: 12,
                color: COLORS.textSoft,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {r.memberCount} miembros · {r.share}% · entrega {r.rates.deliveryRate}%
            </span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 5,
              backgroundColor: COLORS.background,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(2, (r.memberCount / maxMembers) * 100)}%`,
                height: "100%",
                backgroundColor: COLORS.brand,
                borderRadius: 5,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyBars({ buckets }: { buckets: TrendBucket[] }) {
  const w = 360;
  const h = 180;
  const pad = { top: 12, right: 8, bottom: 28, left: 8 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const max = Math.max(
    ...buckets.flatMap((b) => [b.totals.ordersEntered, b.totals.ordersDelivered]),
    1,
  );
  const groupW = innerW / buckets.length;
  const barW = Math.min(18, (groupW - 6) / 2);
  return (
    <div>
      <Legend
        items={[
          { label: "Ingresadas", color: SERIES_COLORS.entered },
          { label: "Entregadas", color: SERIES_COLORS.delivered },
        ]}
      />
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tendencia mensual de pedidos ingresados y entregados"
        style={{ display: "block" }}
      >
        <line
          x1={pad.left}
          x2={w - pad.right}
          y1={h - pad.bottom}
          y2={h - pad.bottom}
          stroke={COLORS.border}
          strokeWidth={1}
        />
        {buckets.map((b, i) => {
          const groupX = pad.left + i * groupW + groupW / 2;
          const enteredH = (b.totals.ordersEntered / max) * innerH;
          const deliveredH = (b.totals.ordersDelivered / max) * innerH;
          return (
            <g key={b.key}>
              <rect
                x={groupX - barW - 1}
                y={h - pad.bottom - enteredH}
                width={barW}
                height={enteredH}
                fill={SERIES_COLORS.entered}
                rx={2}
              >
                <title>
                  {b.label} · Ingresadas: {b.totals.ordersEntered.toLocaleString("es-CO")}
                </title>
              </rect>
              <rect
                x={groupX + 1}
                y={h - pad.bottom - deliveredH}
                width={barW}
                height={deliveredH}
                fill={SERIES_COLORS.delivered}
                rx={2}
              >
                <title>
                  {b.label} · Entregadas: {b.totals.ordersDelivered.toLocaleString("es-CO")}
                </title>
              </rect>
              <text
                x={groupX}
                y={h - pad.bottom + 16}
                textAnchor="middle"
                fontSize={10}
                fill={COLORS.textMuted}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function OpportunityList({ rows }: { rows: ReturnType<typeof rankOpportunities> }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {rows.map((o) => {
        const accent = o.priority
          ? (PRIORITY_COLORS[o.priority]?.text ?? COLORS.border)
          : COLORS.border;
        return (
          <li
            key={o.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${accent}`,
              backgroundColor: COLORS.background,
            }}
          >
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <Link
                href={`/comunidad-dropi/miembros/${o.id}`}
                style={{
                  color: COLORS.brand,
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {o.displayName}
              </Link>
              {o.country ? (
                <span
                  style={{ marginLeft: 6, color: COLORS.textMuted, fontSize: 11 }}
                >
                  {o.country}
                </span>
              ) : null}
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 12,
                  color: COLORS.textSoft,
                  lineHeight: 1.4,
                }}
              >
                {o.reason}
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 6,
              }}
            >
              {o.priority ? <PriorityBadge priority={o.priority} /> : null}
              {o.segment ? <SegmentBadge segment={o.segment} /> : null}
              <MetricChip label="Pedidos" value={o.ordersEntered.toLocaleString("es-CO")} />
              <MetricChip
                label="Devol."
                value={`${o.returnRate}%`}
                danger={o.returnRate >= 30}
              />
              <span style={{ fontSize: 12 }}>
                <DeltaPill value={o.deltaOrdersPercent} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MetricChip({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        fontSize: 11,
        fontWeight: 700,
        color: danger ? COLORS.danger : COLORS.textSoft,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>{label}</span>
      {value}
    </span>
  );
}

function DeltaPill({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: COLORS.textMuted }}>N/D</span>;
  }
  const positive = value >= 0;
  const color = positive ? COLORS.success : COLORS.danger;
  return (
    <span style={{ color, fontWeight: 700 }}>
      {positive ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: align ?? "left",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: COLORS.textSoft,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        verticalAlign: "middle",
        textAlign: align ?? "left",
      }}
    >
      {children}
    </td>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const c = SEGMENT_COLORS[segment] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.text,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {SEGMENT_LABELS[segment] ??
        (segment === "UNSEGMENTED" ? "Sin segmentar" : segment)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_COLORS[priority] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.text,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
      }}
      title={PRIORITY_LABELS[priority] ?? priority}
    >
      {priority}
    </span>
  );
}
