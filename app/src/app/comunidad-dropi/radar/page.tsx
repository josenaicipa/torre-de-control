import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  RADAR_SEGMENT_COLORS,
  RADAR_SEGMENT_LABELS,
  type Radar,
  type RadarKpi,
  type RadarMember,
  type RadarSegment,
} from "@/lib/comunidad-dropi-radar";
import {
  formatMonthRef,
  loadRadar,
  type AvailableMonth,
} from "../_lib/radar-data";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parseMonth(sp: Record<string, string | undefined>): {
  year?: number;
  month?: number;
} {
  const period = sp.period ?? "";
  const [y, m] = period.split("-");
  const year = Number.parseInt(y ?? "", 10);
  const month = Number.parseInt(m ?? "", 10);
  if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
  return {};
}

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const { year, month } = parseMonth(sp);
  const { radar, available } = await loadRadar({ year, month });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {radar ? (
        <RadarBody radar={radar} available={available} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Radar mensual</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Radar de rendimiento
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Foto del cierre mensual: entregadas como métrica reina, segmentación
        automática y ranking de Miembros Dropi. Ingresadas siempre como
        secundaria.
      </p>
    </header>
  );
}

async function RadarBody({
  radar,
  available,
}: {
  radar: Radar;
  available: AvailableMonth[];
}) {
  const currentLabel = formatMonthRef(radar.current);
  const previousLabel = radar.previous ? formatMonthRef(radar.previous) : null;

  const stars = radar.members
    .filter((m) => m.segment === "STAR")
    .sort((a, b) => b.starScore - a.starScore)
    .slice(0, 5);
  const growing = radar.members
    .filter((m) => m.segment === "GROWING")
    .sort(
      (a, b) =>
        (b.deliveredDeltaPct ?? Number.NEGATIVE_INFINITY) -
        (a.deliveredDeltaPct ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, 5);
  const dropping = radar.members
    .filter((m) => m.segment === "DROPPING")
    .sort(
      (a, b) =>
        (a.deliveredDeltaPct ?? Number.POSITIVE_INFINITY) -
        (b.deliveredDeltaPct ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, 5);
  const highReturn = radar.members
    .filter((m) => m.segment === "HIGH_RETURN")
    .sort((a, b) => b.returnRate - a.returnRate)
    .slice(0, 5);

  const openFollowUps = await prisma.dropiFollowUp.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [
      { priority: "asc" },
      { dueDate: { sort: "asc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 5,
    include: {
      member: { select: { id: true, fullName: true, email: true } },
    },
  });

  return (
    <>
      <PeriodNote
        currentLabel={currentLabel}
        previousLabel={previousLabel}
        available={available}
        active={{ year: radar.current.year, month: radar.current.month }}
      />

      <section style={kpiGridStyle()} aria-label="KPIs del mes">
        <KpiCard label="Entregadas" hero kpi={radar.kpis.delivered} />
        <KpiCard label="Ingresadas" kpi={radar.kpis.entered} />
        <KpiCard label="Movidas" kpi={radar.kpis.moved} />
        <KpiCard
          label="Devueltas"
          kpi={radar.kpis.returned}
          accent="inverse"
        />
        <RateCard
          label="Tasa de entrega"
          current={radar.kpis.deliveryRate.current}
          previous={radar.kpis.deliveryRate.previous}
        />
        <RateCard
          label="Tasa de devolución"
          current={radar.kpis.returnRate.current}
          previous={radar.kpis.returnRate.previous}
          accent="inverse"
        />
        <SimpleKpi
          label="Miembros activos"
          value={radar.kpis.activeMembers.current}
          sublabel={`${radar.kpis.totalMembers} miembros en total`}
        />
        <SegmentMix radar={radar} />
      </section>

      <section style={twoColStyle()}>
        <MembersCard
          title="Top estrellas"
          tone="STAR"
          members={stars}
          empty="Aún no hay miembros con score estrella este mes."
          metric="starScore"
        />
        <MembersCard
          title="Creciendo"
          tone="GROWING"
          members={growing}
          empty="Ningún miembro creció >10% en entregadas vs. mes anterior."
          metric="growth"
        />
      </section>

      <section style={twoColStyle()}>
        <MembersCard
          title="Decreciendo"
          tone="DROPPING"
          members={dropping}
          empty="Ningún miembro cayó >10% en entregadas vs. mes anterior."
          metric="decline"
        />
        <MembersCard
          title="Devoluciones altas"
          tone="HIGH_RETURN"
          members={highReturn}
          empty="Ningún miembro supera el umbral de 25% de devoluciones."
          metric="returnRate"
        />
      </section>

      <section style={{ marginTop: 18 }}>
        <Card
          title="Acciones abiertas"
          right={
            <Link
              href="/comunidad-dropi/acciones"
              style={ghostLinkStyle()}
            >
              Ver todas →
            </Link>
          }
        >
          {openFollowUps.length === 0 ? (
            <EmptyText text="No hay acciones abiertas en este momento." />
          ) : (
            <ul style={listStyle()}>
              {openFollowUps.map((f) => (
                <li key={f.id} style={listItemStyle()}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <Link
                      href={`/comunidad-dropi/miembros/${f.member.id}`}
                      style={memberLinkStyle()}
                    >
                      {f.member.fullName ?? f.member.email ?? "Sin nombre"}
                    </Link>
                    <span
                      style={{
                        color: COLORS.textSoft,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {f.suggestedAction ?? labelReason(f.reason)}
                    </span>
                  </div>
                  <span style={priorityChipStyle(f.priority)}>
                    {f.priority}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

function labelReason(reason: string): string {
  const map: Record<string, string> = {
    ZERO_SALES: "Sin ventas",
    DROP: "Caída",
    HIGH_RETURN: "Devoluciones altas",
    LOW_VOLUME: "Bajo volumen",
    TOP_PERFORMER: "Mejor vendedor",
    OTHER: "Otro",
  };
  return map[reason] ?? reason;
}

function PeriodNote({
  currentLabel,
  previousLabel,
  available,
  active,
}: {
  currentLabel: string;
  previousLabel: string | null;
  available: AvailableMonth[];
  active: { year: number; month: number };
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        marginBottom: 14,
        fontSize: 12,
        color: COLORS.textSoft,
      }}
    >
      <span>
        Mes actual: <strong>{currentLabel}</strong>
        {previousLabel ? (
          <>
            {" "}
            · Comparado con <strong>{previousLabel}</strong>
          </>
        ) : null}
      </span>
      {available.length > 1 ? (
        <form method="get" style={{ display: "inline-flex", gap: 6 }}>
          <label
            htmlFor="period"
            style={{ alignSelf: "center", color: COLORS.textMuted }}
          >
            Cambiar mes:
          </label>
          <select
            id="period"
            name="period"
            defaultValue={`${active.year}-${active.month}`}
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
              <option key={`${a.year}-${a.month}`} value={`${a.year}-${a.month}`}>
                {formatMonthRef(a)}
              </option>
            ))}
          </select>
          <button type="submit" style={ghostButtonStyle()}>
            Aplicar
          </button>
        </form>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  kpi,
  hero,
  accent,
}: {
  label: string;
  kpi: RadarKpi;
  hero?: boolean;
  accent?: "normal" | "inverse";
}) {
  const dir = accent ?? "normal";
  const showDelta = kpi.deltaPct != null && Number.isFinite(kpi.deltaPct);
  const positive = (kpi.deltaPct ?? 0) >= 0;
  const goodColor = dir === "inverse" ? COLORS.danger : COLORS.success;
  const badColor = dir === "inverse" ? COLORS.success : COLORS.danger;
  const deltaColor = positive ? goodColor : badColor;
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
          fontSize: hero ? 30 : 24,
          fontWeight: 800,
          color: COLORS.text,
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
          {positive ? "▲" : "▼"} {Math.abs(kpi.deltaPct as number)}% vs. mes
          anterior
        </p>
      ) : kpi.previous != null ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          {kpi.previous.toLocaleString("es-CO")} el mes anterior
        </p>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Sin mes previo
        </p>
      )}
    </div>
  );
}

function RateCard({
  label,
  current,
  previous,
  accent,
}: {
  label: string;
  current: number;
  previous: number | null;
  accent?: "normal" | "inverse";
}) {
  const dir = accent ?? "normal";
  const delta = previous == null ? null : current - previous;
  const showDelta = delta != null && Number.isFinite(delta);
  const positive = (delta ?? 0) >= 0;
  const goodColor = dir === "inverse" ? COLORS.danger : COLORS.success;
  const badColor = dir === "inverse" ? COLORS.success : COLORS.danger;
  const deltaColor = positive ? goodColor : badColor;
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
          fontSize: 24,
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: "-0.02em",
        }}
      >
        {current}%
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
          {positive ? "▲" : "▼"} {Math.abs(delta as number).toFixed(2)} pts vs.
          mes anterior
        </p>
      ) : (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Sin mes previo
        </p>
      )}
    </div>
  );
}

function SimpleKpi({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string;
}) {
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
          fontSize: 24,
          fontWeight: 800,
          color: COLORS.text,
          letterSpacing: "-0.02em",
        }}
      >
        {value.toLocaleString("es-CO")}
      </p>
      {sublabel ? (
        <p
          style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.textMuted }}
        >
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

function SegmentMix({ radar }: { radar: Radar }) {
  const buckets = radar.segmentBuckets;
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <p style={eyebrowStyle()}>Mezcla de segmentos</p>
      {buckets.length === 0 ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: COLORS.textMuted,
          }}
        >
          Sin segmentos calculados.
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              height: 10,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: COLORS.background,
            }}
          >
            {buckets.map((b) => (
              <span
                key={b.segment}
                title={`${RADAR_SEGMENT_LABELS[b.segment]} · ${b.share}%`}
                style={{
                  width: `${b.share}%`,
                  backgroundColor: RADAR_SEGMENT_COLORS[b.segment].text,
                }}
              />
            ))}
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            {buckets.map((b) => (
              <li key={b.segment}>
                <Link
                  href={`/comunidad-dropi/segmentos#${b.segment}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    backgroundColor: RADAR_SEGMENT_COLORS[b.segment].bg,
                    color: RADAR_SEGMENT_COLORS[b.segment].text,
                    fontSize: 11,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {RADAR_SEGMENT_LABELS[b.segment]} · {b.memberCount}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function MembersCard({
  title,
  tone,
  members,
  empty,
  metric,
}: {
  title: string;
  tone: RadarSegment;
  members: RadarMember[];
  empty: string;
  metric: "starScore" | "growth" | "decline" | "returnRate";
}) {
  return (
    <Card
      title={title}
      badge={
        <span
          style={{
            display: "inline-flex",
            padding: "2px 8px",
            borderRadius: 999,
            backgroundColor: RADAR_SEGMENT_COLORS[tone].bg,
            color: RADAR_SEGMENT_COLORS[tone].text,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {RADAR_SEGMENT_LABELS[tone]}
        </span>
      }
    >
      {members.length === 0 ? (
        <EmptyText text={empty} />
      ) : (
        <ul style={listStyle()}>
          {members.map((m) => (
            <li key={m.id} style={listItemStyle()}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link
                  href={`/comunidad-dropi/miembros/${m.id}`}
                  style={memberLinkStyle()}
                >
                  {m.fullName ?? m.email ?? "Sin nombre"}
                </Link>
                <span
                  style={{
                    color: COLORS.textSoft,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {m.current.ordersDelivered.toLocaleString("es-CO")}{" "}
                  entregadas ·{" "}
                  {m.current.ordersEntered.toLocaleString("es-CO")} ingresadas
                  {m.country ? ` · ${m.country}` : ""}
                </span>
              </div>
              <MetricBadge member={m} metric={metric} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MetricBadge({
  member,
  metric,
}: {
  member: RadarMember;
  metric: "starScore" | "growth" | "decline" | "returnRate";
}) {
  if (metric === "starScore") {
    return (
      <span style={metricChipStyle(COLORS.success)}>
        ★ {member.starScore.toFixed(0)}
      </span>
    );
  }
  if (metric === "growth") {
    const pct = member.deliveredDeltaPct;
    return (
      <span style={metricChipStyle(COLORS.success)}>
        ▲ {pct != null ? `${Math.abs(pct)}%` : "—"}
      </span>
    );
  }
  if (metric === "decline") {
    const pct = member.deliveredDeltaPct;
    return (
      <span style={metricChipStyle(COLORS.danger)}>
        ▼ {pct != null ? `${Math.abs(pct)}%` : "—"}
      </span>
    );
  }
  return (
    <span style={metricChipStyle(COLORS.danger)}>
      {member.returnRate}% devol.
    </span>
  );
}

function Card({
  title,
  badge,
  right,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          {badge}
        </div>
        {right}
      </div>
      <div>{children}</div>
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
        Aún no hay datos para el radar
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        Importa al menos un cierre mensual para que el radar muestre KPIs,
        segmentación y ranking de Miembros Dropi.
      </p>
      <Link href="/comunidad-dropi/importaciones" style={primaryLinkStyle()}>
        Ir a Importaciones
      </Link>
    </section>
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

function kpiGridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
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

function listStyle(): React.CSSProperties {
  return { listStyle: "none", margin: 0, padding: 0 };
}

function listItemStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 0",
    borderBottom: `1px solid ${COLORS.border}`,
  };
}

function memberLinkStyle(): React.CSSProperties {
  return {
    color: COLORS.brand,
    fontWeight: 700,
    fontSize: 14,
    textDecoration: "none",
  };
}

function metricChipStyle(color: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 700,
    color,
    whiteSpace: "nowrap",
  };
}

function priorityChipStyle(priority: string): React.CSSProperties {
  const map: Record<string, { bg: string; text: string }> = {
    P1: { bg: "#FEE2E2", text: "#991B1B" },
    P2: { bg: "#FEF3C7", text: "#92400E" },
    P3: { bg: "#F1F5F9", text: "#475569" },
    P4: { bg: "#FAE8FF", text: "#86198F" },
  };
  const c = map[priority] ?? { bg: "#F1F5F9", text: "#475569" };
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: c.bg,
    color: c.text,
    fontSize: 11,
    fontWeight: 700,
  };
}

function ghostLinkStyle(): React.CSSProperties {
  return {
    color: COLORS.textSoft,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
  };
}

function ghostButtonStyle(): React.CSSProperties {
  return {
    padding: "4px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    fontSize: 12,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    cursor: "pointer",
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
