import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  buildByCountry,
  buildBySegment,
  buildMonthlyTrend,
  buildOverview,
  buildWeeklyTrend,
  rankOpportunities,
  ratesFromTotals,
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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />

      <PeriodNote
        latestPeriod={latestPeriod}
        previousPeriod={previousPeriod}
      />

      <section style={kpiGridStyle()} aria-label="Indicadores principales">
        <Kpi
          label="Pedidos ingresados"
          value={overview.current.totals.ordersEntered}
          delta={overview.deltas?.ordersEntered.pct ?? null}
        />
        <Kpi
          label="Pedidos movidos"
          value={overview.current.totals.ordersMoved}
          delta={overview.deltas?.ordersMoved.pct ?? null}
        />
        <Kpi
          label="Entregados"
          value={overview.current.totals.ordersDelivered}
          delta={overview.deltas?.ordersDelivered.pct ?? null}
        />
        <Kpi
          label="Devueltos"
          value={overview.current.totals.ordersReturned}
          delta={overview.deltas?.ordersReturned.pct ?? null}
          accentDirection="inverse"
        />
        <Kpi
          label="Tasa de movimiento"
          value={`${overview.current.rates.movementRate}%`}
          delta={overview.deltas?.movementRate.pct ?? null}
        />
        <Kpi
          label="Tasa de entrega"
          value={`${overview.current.rates.deliveryRate}%`}
          delta={overview.deltas?.deliveryRate.pct ?? null}
        />
        <Kpi
          label="Tasa de devolución"
          value={`${overview.current.rates.returnRate}%`}
          delta={overview.deltas?.returnRate.pct ?? null}
          accentDirection="inverse"
        />
        <Kpi
          label="Miembros activos"
          value={overview.activeMembers}
          sublabel={`${overview.totalMembers} en total`}
        />
      </section>

      <section style={twoColStyle()}>
        <Card title="Tendencia semanal (últimas 8)">
          {weeklyBuckets.length === 0 ? (
            <EmptyText text="Sin tendencia semanal aún." />
          ) : (
            <TrendTable buckets={weeklyBuckets} labelHeader="Semana" />
          )}
        </Card>
        <Card title="Tendencia mensual (últimos 6)">
          {monthlyBuckets.length === 0 ? (
            <EmptyText text="Sin tendencia mensual aún." />
          ) : (
            <TrendTable buckets={monthlyBuckets} labelHeader="Mes" />
          )}
        </Card>
      </section>

      <section style={twoColStyle()}>
        <Card title="Distribución por país">
          {countryBuckets.length === 0 ? (
            <EmptyText text="Sin datos por país." />
          ) : (
            <CountryTable rows={countryBuckets} />
          )}
        </Card>
        <Card title="Distribución por segmento">
          {segmentBuckets.length === 0 ? (
            <EmptyText text="Sin segmentos calculados." />
          ) : (
            <SegmentList rows={segmentBuckets} />
          )}
        </Card>
      </section>

      <section style={{ marginTop: 18 }}>
        <Card title="Oportunidades prioritarias">
          {opportunities.length === 0 ? (
            <EmptyText text="No hay oportunidades para mostrar." />
          ) : (
            <OpportunitiesTable rows={opportunities} />
          )}
        </Card>
      </section>
    </div>
  );
}

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
        Comunidad Dropi · Inteligencia de datos
      </p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Inteligencia de la comunidad
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        KPIs operativos, tendencias semanales y mensuales, distribución por
        país y segmento, y un ranking automático de oportunidades para los
        seguimientos comerciales.
      </p>
    </header>
  );
}

function PeriodNote({
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
          margin: "0 0 14px",
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
    <p
      style={{
        margin: "0 0 14px",
        fontSize: 12,
        color: COLORS.textSoft,
      }}
    >
      Período actual: <strong>{current}</strong>
      {previous ? (
        <>
          {" "}
          · Comparado con <strong>{previous}</strong>
        </>
      ) : null}
    </p>
  );
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
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  sublabel?: string;
  accentDirection?: "normal" | "inverse";
}) {
  const showDelta = delta != null && Number.isFinite(delta);
  const direction = accentDirection ?? "normal";
  const isPositive = (delta ?? 0) >= 0;
  const goodColor = direction === "inverse" ? COLORS.danger : COLORS.success;
  const badColor = direction === "inverse" ? COLORS.success : COLORS.danger;
  const deltaColor = isPositive ? goodColor : badColor;
  const deltaPrefix = isPositive ? "▲" : "▼";
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
        }}
      >
        {value}
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
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
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
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
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

function CountryTable({
  rows,
}: {
  rows: ReturnType<typeof buildByCountry>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        role="grid"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead style={{ backgroundColor: COLORS.background }}>
          <tr>
            <Th>País</Th>
            <Th align="right">Miembros</Th>
            <Th align="right">% comunidad</Th>
            <Th align="right">Ingresadas</Th>
            <Th align="right">Tasa entrega</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.country}
              style={{ borderTop: `1px solid ${COLORS.border}` }}
            >
              <Td>{r.country}</Td>
              <Td align="right">{r.memberCount}</Td>
              <Td align="right">{r.share}%</Td>
              <Td align="right">{r.totals.ordersEntered}</Td>
              <Td align="right">{r.rates.deliveryRate}%</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentList({
  rows,
}: {
  rows: ReturnType<typeof buildBySegment>;
}) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {rows.map((r) => (
        <li
          key={r.segment}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0",
            borderBottom: `1px solid ${COLORS.border}`,
            fontSize: 13,
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <SegmentBadge segment={r.segment} />
          <span style={{ color: COLORS.textSoft, fontWeight: 600 }}>
            {r.memberCount} miembros · {r.share}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpportunitiesTable({
  rows,
}: {
  rows: ReturnType<typeof rankOpportunities>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        role="grid"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead style={{ backgroundColor: COLORS.background }}>
          <tr>
            <Th>Miembro</Th>
            <Th>Segmento</Th>
            <Th>Prioridad</Th>
            <Th align="right">Pedidos</Th>
            <Th align="right">Devol.</Th>
            <Th align="right">Δ</Th>
            <Th>Motivo</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <Td>
                <Link
                  href={`/comunidad-dropi/miembros/${o.id}`}
                  style={{
                    color: COLORS.brand,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {o.displayName}
                </Link>
                {o.country ? (
                  <span
                    style={{
                      marginLeft: 6,
                      color: COLORS.textMuted,
                      fontSize: 11,
                    }}
                  >
                    {o.country}
                  </span>
                ) : null}
              </Td>
              <Td>
                {o.segment ? (
                  <SegmentBadge segment={o.segment} />
                ) : (
                  <span style={{ color: COLORS.textMuted }}>—</span>
                )}
              </Td>
              <Td>
                {o.priority ? (
                  <PriorityBadge priority={o.priority} />
                ) : (
                  <span style={{ color: COLORS.textMuted }}>—</span>
                )}
              </Td>
              <Td align="right">{o.ordersEntered}</Td>
              <Td align="right">{o.returnRate}%</Td>
              <Td align="right">
                <DeltaPill value={o.deltaOrdersPercent} />
              </Td>
              <Td>
                <span style={{ color: COLORS.textSoft }}>{o.reason}</span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeltaPill({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: COLORS.textMuted }}>—</span>;
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
