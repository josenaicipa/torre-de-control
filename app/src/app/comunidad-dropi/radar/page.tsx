// Pulso Comunidad Dropi — pantalla reina del módulo.
//
// Objetivo de UX: en máximo 5 segundos el operador entiende:
//   1) qué hay que hacer hoy (P1 abiertos, vencidos, para hoy, sin asignar),
//   2) si la comunidad creció o decreció vs. la comparación (comparativo
//      semanal por default, con cambio a mensual),
//   3) las cohortes de entregas (top, en caída, crecimiento por bandas),
//   4) a quién darle amor, a quién ayudar, quiénes son las estrellas y
//      quiénes están en riesgo por devoluciones,
//   5) los KPIs del mes y la calidad de datos como soporte.
//
// La lectura dominante son comparativo + cohortes de entregas. El "Pulso del
// mes" queda como banner compacto debajo: si no aporta acción concreta, no
// puede tomarse la pantalla.
//
// Notas:
//   - La ruta sigue siendo /comunidad-dropi/radar para no romper enlaces.
//   - El selector mensual del Radar (`?period=YYYY-MM`) controla tanto los
//     KPIs/segmentos como las cohortes mensuales — son el mismo motor.
//   - El comparativo trae su propio par de selectores (granularidad +
//     período principal + período de comparación). Default: semanal actual
//     vs. semana anterior.
//   - "Decreciendo" en las listas se ordena por pérdida absoluta primero y
//     porcentaje como desempate: una caída de 200 entregadas pesa más que un
//     −90% sobre 5.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  RADAR_PULSE_COLORS,
  RADAR_SEGMENT_COLORS,
  RADAR_SEGMENT_LABELS,
  type Radar,
  type RadarKpi,
  type RadarMember,
  type RadarQualitySummary,
  type RadarSegment,
} from "@/lib/comunidad-dropi-radar";
import {
  formatMonthRef,
  loadRadar,
  type AvailableMonth,
} from "../_lib/radar-data";
import { loadComparativo, type Granularity } from "../_lib/crecimiento-data";
import { COLORS } from "../_lib/tokens";
import {
  parsePeriod,
  periodKey,
  buildHref,
} from "../_lib/period";
import {
  classifyImportAge,
  type ImportAgeInfo,
} from "../_lib/import-age";
import {
  buildMemberFollowUpStatus,
  computeRadarFollowUpStats,
  memberFollowUpStateOf,
  MEMBER_FOLLOW_UP_STATE_COLORS,
  MEMBER_FOLLOW_UP_STATE_LABELS,
  type MemberFollowUpState,
  type MemberFollowUpStatus,
  type RadarFollowUpStats,
} from "../_lib/follow-up-stats";
import { pickHelp, pickLove } from "../_lib/radar-lists";
import { SubNav } from "../_components/SubNav";
import { PeriodSelector } from "../_components/PeriodSelector";
import { ComparativoSection } from "../_components/Comparativo";
import { CohortesSection } from "../_components/Cohortes";

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

export default async function PulsoPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const { year, month } = parsePeriod(sp.period);
  const granularity = parseGranularity(sp.granularity);
  const currentKey = sp.current ?? null;
  const comparisonKey = sp.comparison ?? null;

  const [{ radar, available, lastImportAt }, comparativo] = await Promise.all([
    loadRadar({ year, month }),
    loadComparativo({ granularity, currentKey, comparisonKey }),
  ]);
  const importAge = classifyImportAge(lastImportAt);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {radar || comparativo ? (
        <PulsoBody
          radar={radar}
          available={available}
          importAge={importAge}
          comparativo={comparativo}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Pantalla reina</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Pulso Comunidad Dropi
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        En 5 segundos: ¿qué hago hoy?, ¿crecimos o caímos vs. la comparación?,
        ¿quién está en cohorte de crecimiento, caída o top? Entregadas es la
        métrica reina.
      </p>
    </header>
  );
}

async function PulsoBody({
  radar,
  available,
  importAge,
  comparativo,
}: {
  radar: Radar | null;
  available: AvailableMonth[];
  importAge: ImportAgeInfo;
  comparativo: Awaited<ReturnType<typeof loadComparativo>>;
}) {
  const currentLabel = radar ? formatMonthRef(radar.current) : null;
  const previousLabel =
    radar && radar.previous ? formatMonthRef(radar.previous) : null;
  const period = radar ? periodKey(radar.current) : null;

  // "Dar amor" amplía el bucket GROWING con RECOVERED y NEW para que la
  // pantalla muestre todo lo que merece reconocimiento explícito. "Ayudar"
  // junta DROPPING con INACTIVE para no esconder a los miembros que se
  // apagaron este mes. Los selectores viven en `_lib/radar-lists.ts` para
  // que la regla "pérdida absoluta manda sobre porcentaje" sea testeable.
  const love = radar ? pickLove(radar.members, 5) : [];
  const help = radar ? pickHelp(radar.members, 5) : [];
  const stars = radar
    ? topBy(
        radar.members.filter((m) => m.segment === "STAR"),
        (a, b) => b.starScore - a.starScore,
        5,
      )
    : [];
  const highReturn = radar
    ? topBy(
        radar.members.filter((m) => m.segment === "HIGH_RETURN"),
        (a, b) => b.returnRate - a.returnRate,
        5,
      )
    : [];

  // Una sola query alimenta tanto el banner "Qué hacer hoy" como los chips
  // de seguimiento por miembro. Filtramos por status activo para que el
  // payload no crezca con histórico ya resuelto.
  const activeFollowUps = await prisma.dropiFollowUp.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: {
      memberId: true,
      status: true,
      priority: true,
      dueDate: true,
      assignedToId: true,
      assignedTo: { select: { name: true, email: true } },
    },
  });
  const now = new Date();
  const followUpStats = computeRadarFollowUpStats(activeFollowUps, now);
  const memberFollowUpStatus = buildMemberFollowUpStatus(
    activeFollowUps.map((f) => ({
      memberId: f.memberId,
      status: f.status,
      priority: f.priority,
      dueDate: f.dueDate,
      assignedToId: f.assignedToId,
      assignedName: f.assignedTo
        ? f.assignedTo.name ?? f.assignedTo.email ?? null
        : null,
    })),
    now,
  );

  // Inputs ocultos que el form del comparativo y el del cohort-month deben
  // arrastrar para no perder el otro estado. El comparativo no usa
  // `?period=`; el cohort-month no usa `granularity/current/comparison`.
  // Acá vivimos en Radar, así que conservamos `?period=` mensual cuando el
  // usuario cambia algo del comparativo.
  const periodHidden = period
    ? [{ name: "period", value: period }]
    : undefined;

  return (
    <>
      {currentLabel ? (
        <PeriodNote
          currentLabel={currentLabel}
          previousLabel={previousLabel}
          available={available}
          active={
            radar
              ? { year: radar.current.year, month: radar.current.month }
              : null
          }
          importAge={importAge}
        />
      ) : (
        <ImportAgeBanner importAge={importAge} />
      )}

      <TodayActionsCard stats={followUpStats} />

      {comparativo ? (
        <ComparativoSection
          comparativo={comparativo}
          formAction="/comunidad-dropi/radar"
          extraHiddenInputs={periodHidden}
          drillDownHref={
            period
              ? `/comunidad-dropi/crecimiento?period=${period}`
              : "/comunidad-dropi/crecimiento"
          }
          drillDownLabel="Ver detalle en Crecimiento →"
        />
      ) : (
        <ComparativoEmpty />
      )}

      {radar ? (
        <CohortesSection
          members={radar.members}
          monthLabel={currentLabel ?? ""}
          ctaHref="/comunidad-dropi/seguimientos?priority=P1"
          ctaLabel="Ir a Seguimientos P1 →"
        />
      ) : (
        <CohortesEmpty />
      )}

      {radar ? <DegradedPulse radar={radar} period={period ?? ""} /> : null}

      {radar ? (
        <>
          <section style={twoColStyle()}>
            <MembersCard
              title="Dar amor"
              subtitle="Creciendo, recuperados y nuevos con tracción"
              tone="GROWING"
              members={love}
              empty="Ningún miembro creció, se recuperó o reactivó esta ventana."
              metric="growth"
              followUpStatus={memberFollowUpStatus}
            />
            <MembersCard
              title="Ayudar"
              subtitle="Decreciendo o sin actividad este mes"
              tone="DROPPING"
              members={help}
              empty="Ningún miembro cayó >10% en entregadas vs. mes anterior."
              metric="decline"
              followUpStatus={memberFollowUpStatus}
            />
          </section>

          <section style={twoColStyle()}>
            <MembersCard
              title="Estrellas"
              subtitle="Alto volumen, baja devolución y score sostenido"
              tone="STAR"
              members={stars}
              empty="Aún no hay miembros con score estrella este mes."
              metric="starScore"
              followUpStatus={memberFollowUpStatus}
            />
            <MembersCard
              title="Riesgo por devoluciones"
              subtitle="Tasa de devolución ≥ 25% sobre ingresadas"
              tone="HIGH_RETURN"
              members={highReturn}
              empty="Ningún miembro supera el umbral de 25% de devoluciones."
              metric="returnRate"
              followUpStatus={memberFollowUpStatus}
            />
          </section>

          <section style={kpiGridStyle()} aria-label="KPIs del mes">
            <KpiCard label="Entregadas" hero kpi={radar.kpis.delivered} />
            <KpiCard label="Ingresadas" kpi={radar.kpis.entered} />
            <KpiCard
              label="Devoluciones"
              kpi={radar.kpis.returned}
              accent="inverse"
            />
            <RateCard
              label="Conversión entrega/ingresadas"
              current={radar.kpis.deliveryRate.current}
              previous={radar.kpis.deliveryRate.previous}
              hint="entregadas ÷ ingresadas"
            />
            <RateCard
              label="Entrega operativa entregadas/movidas"
              current={radar.kpis.deliveryRateOperational.current}
              previous={radar.kpis.deliveryRateOperational.previous}
              hint="entregadas ÷ movidas"
            />
            <RateCard
              label="Tasa de devolución"
              current={radar.kpis.returnRate.current}
              previous={radar.kpis.returnRate.previous}
              accent="inverse"
              hint="devoluciones ÷ ingresadas"
            />
            <SimpleKpi
              label="Miembros activos"
              value={radar.kpis.activeMembers.current}
              sublabel={`${radar.kpis.totalMembers} miembros en total`}
            />
            <SegmentMix radar={radar} period={period ?? ""} />
          </section>

          <QualityBlock
            quality={radar.quality}
            importAge={importAge}
            currentLabel={currentLabel ?? ""}
          />
        </>
      ) : null}
    </>
  );
}

function topBy(
  arr: RadarMember[],
  cmp: (a: RadarMember, b: RadarMember) => number,
  n: number,
): RadarMember[] {
  return [...arr].sort(cmp).slice(0, n);
}

function TodayActionsCard({ stats }: { stats: RadarFollowUpStats }) {
  const tiles: Array<{
    key: string;
    label: string;
    value: number;
    href: string;
    accent: string;
    hint?: string;
  }> = [
    {
      key: "urgent",
      label: "P1 abiertos",
      value: stats.urgentCount,
      href: "/comunidad-dropi/seguimientos?priority=P1",
      accent: "#B91C1C",
      hint: "Prioridad máxima en cola",
    },
    {
      key: "overdue",
      label: "Vencidos",
      value: stats.overdueCount,
      href: "/comunidad-dropi/seguimientos?bucket=OVERDUE",
      accent: "#B91C1C",
      hint: "Días atrás de la fecha límite",
    },
    {
      key: "today",
      label: "Para hoy",
      value: stats.todayCount,
      href: "/comunidad-dropi/seguimientos?bucket=TODAY",
      accent: "#D97706",
      hint: "Cierre antes de fin de día",
    },
    {
      key: "unassigned",
      label: "Sin asignar",
      value: stats.unassignedCount,
      href: "/comunidad-dropi/seguimientos?unassigned=1",
      accent: "#475569",
      hint: "Aún sin responsable",
    },
  ];

  return (
    <section
      aria-label="Qué hacer hoy"
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 16,
        marginBottom: 18,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={eyebrowStyle()}>Qué hacer hoy</p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.text,
            }}
          >
            {stats.openCount === 0
              ? "Cola vacía: sin seguimientos abiertos."
              : `${stats.openCount} seguimientos abiertos o en curso ahora mismo.`}
          </p>
        </div>
        <Link
          href="/comunidad-dropi/seguimientos"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "8px 14px",
            borderRadius: 8,
            backgroundColor: COLORS.brand,
            color: COLORS.surface,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Ir a Seguimientos →
        </Link>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            style={{
              display: "block",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              borderTop: `3px solid ${t.accent}`,
              textDecoration: "none",
              color: COLORS.text,
              backgroundColor: COLORS.surface,
            }}
          >
            <span style={eyebrowStyle()}>{t.label}</span>
            <span
              style={{
                display: "block",
                marginTop: 6,
                fontSize: 26,
                fontWeight: 800,
                color: COLORS.text,
                letterSpacing: "-0.02em",
              }}
            >
              {t.value}
            </span>
            {t.hint ? (
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 11,
                  color: COLORS.textMuted,
                }}
              >
                {t.hint}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

// "Pulso del mes" reducido a banner compacto: una sola línea visible con dot
// de color y headline corto. La señal principal ya vive arriba en comparativo
// + cohortes; el pulso queda como confirmación contextual.
function DegradedPulse({ radar, period }: { radar: Radar; period: string }) {
  const colors = RADAR_PULSE_COLORS[radar.pulse.state];
  return (
    <section
      aria-label="Pulso del mes"
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.text}22`,
        borderLeft: `4px solid ${colors.dot}`,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 18,
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: colors.dot,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: colors.text,
        }}
      >
        Pulso del mes
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 10px",
          borderRadius: 999,
          backgroundColor: colors.dot,
          color: "#FFFFFF",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {radar.pulse.label}
      </span>
      <span
        style={{
          color: colors.text,
          fontSize: 13,
          fontWeight: 600,
          flex: 1,
          minWidth: 240,
        }}
      >
        {radar.pulse.headline}
      </span>
      <Link
        href={buildHref("/comunidad-dropi/segmentos", { period })}
        style={{
          color: colors.text,
          fontSize: 11,
          fontWeight: 700,
          textDecoration: "underline",
        }}
      >
        Ver segmentos →
      </Link>
    </section>
  );
}

function PeriodNote({
  currentLabel,
  previousLabel,
  available,
  active,
  importAge,
}: {
  currentLabel: string;
  previousLabel: string | null;
  available: AvailableMonth[];
  active: { year: number; month: number } | null;
  importAge: ImportAgeInfo;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
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
          {" · Controla cohortes mensuales y KPIs"}
        </span>
        {active ? (
          <PeriodSelector
            basePath="/comunidad-dropi/radar"
            active={active}
            available={available}
          />
        ) : null}
      </div>
      <ImportAgeBanner importAge={importAge} />
    </div>
  );
}

function ImportAgeBanner({ importAge }: { importAge: ImportAgeInfo }) {
  if (importAge.status === "fresh") {
    return (
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: COLORS.textMuted,
        }}
      >
        {importAge.message}
      </p>
    );
  }
  const stale = importAge.status === "stale";
  const palette = stale
    ? { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E" }
    : { bg: "#F1F5F9", border: "#CBD5E1", text: "#475569" };
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: 12,
        fontWeight: 600,
        alignSelf: "flex-start",
      }}
    >
      <span aria-hidden style={{ fontSize: 13 }}>
        {stale ? "⚠" : "ℹ"}
      </span>
      <span>{importAge.message}</span>
    </div>
  );
}

function ComparativoEmpty() {
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
      <p style={eyebrowStyle()}>Seguimiento de crecimiento</p>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 13,
        }}
      >
        Aún no hay períodos cargados para comparar. Importá al menos un cierre
        semanal o mensual para activar el comparativo.
      </p>
    </section>
  );
}

function CohortesEmpty() {
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
      <p style={eyebrowStyle()}>Cohortes sobre entregas</p>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 13,
        }}
      >
        Sin cierre mensual confirmado. Las cohortes (Top, en caída,
        crecimiento) se activan al importar un reporte mensual de Dropi.
      </p>
    </section>
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
  hint,
}: {
  label: string;
  current: number;
  previous: number | null;
  accent?: "normal" | "inverse";
  hint?: string;
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
        <p style={{ margin: "4px 0 0", fontSize: 12, color: COLORS.textMuted }}>
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

function SegmentMix({ radar, period }: { radar: Radar; period: string }) {
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
                  href={`${buildHref("/comunidad-dropi/segmentos", { period })}#${b.segment}`}
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
  subtitle,
  tone,
  members,
  empty,
  metric,
  followUpStatus,
}: {
  title: string;
  subtitle?: string;
  tone: RadarSegment;
  members: RadarMember[];
  empty: string;
  metric: "starScore" | "growth" | "decline" | "returnRate";
  followUpStatus: ReadonlyMap<string, MemberFollowUpStatus>;
}) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
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
          {members.map((m) => {
            const fu = memberFollowUpStateOf(followUpStatus, m.id);
            return (
              <li key={m.id} style={listItemStyle()}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                    minWidth: 0,
                    gap: 4,
                  }}
                >
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
                    }}
                  >
                    {m.current.ordersDelivered.toLocaleString("es-CO")} entregadas
                    · {m.current.ordersEntered.toLocaleString("es-CO")} ingresadas
                    {m.country ? ` · ${m.country}` : ""}
                  </span>
                  <FollowUpStateLine state={fu.state} assignedName={fu.assignedName} />
                  <span
                    style={{
                      color: COLORS.textMuted,
                      fontSize: 12,
                      fontStyle: "italic",
                    }}
                  >
                    Acción sugerida: {m.suggestedAction}
                  </span>
                </div>
                <MetricBadge member={m} metric={metric} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function FollowUpStateLine({
  state,
  assignedName,
}: {
  state: MemberFollowUpState;
  assignedName: string | null;
}) {
  const palette = MEMBER_FOLLOW_UP_STATE_COLORS[state];
  const label = MEMBER_FOLLOW_UP_STATE_LABELS[state];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: COLORS.textSoft,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          padding: "2px 8px",
          borderRadius: 999,
          backgroundColor: palette.bg,
          color: palette.text,
          fontSize: 11,
          fontWeight: 700,
          border: `1px solid ${palette.border}`,
        }}
      >
        {label}
      </span>
      {assignedName ? <span>· asignado a {assignedName}</span> : null}
    </span>
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
    const delta = member.deliveredDelta;
    return (
      <span style={metricChipStyle(COLORS.success)}>
        ▲ {delta != null ? `+${delta.toLocaleString("es-CO")}` : `+${member.current.ordersDelivered}`}
        {pct != null ? ` · ${Math.abs(pct)}%` : ""}
      </span>
    );
  }
  if (metric === "decline") {
    const pct = member.deliveredDeltaPct;
    const delta = member.deliveredDelta;
    return (
      <span style={metricChipStyle(COLORS.danger)}>
        ▼ {delta != null ? delta.toLocaleString("es-CO") : `-${member.previous?.ordersDelivered ?? 0}`}
        {pct != null ? ` · ${Math.abs(pct)}%` : ""}
      </span>
    );
  }
  return (
    <span style={metricChipStyle(COLORS.danger)}>
      {member.returnRate}% devol.
    </span>
  );
}

function QualityBlock({
  quality,
  importAge,
  currentLabel,
}: {
  quality: RadarQualitySummary;
  importAge: ImportAgeInfo;
  currentLabel: string;
}) {
  const sharePct = (count: number) => {
    if (quality.totalMembers === 0) return 0;
    return Math.round((count / quality.totalMembers) * 100);
  };
  const noHistoryPct = sharePct(quality.membersWithoutHistory);
  const noLinkedPct = sharePct(quality.membersWithoutLinkedStudent);
  const inactivePct = sharePct(quality.membersInactiveThisMonth);
  const lastImportLabel =
    importAge.formattedDate ?? "Sin importación confirmada";
  const lastImportHint =
    importAge.status === "stale"
      ? `Hace ${importAge.daysSince} días: el Pulso puede estar desactualizado.`
      : importAge.status === "missing"
        ? "No hay cierre confirmado registrado para este módulo."
        : "Fecha del último cierre confirmado para este módulo.";

  return (
    <section style={{ marginTop: 18, marginBottom: 18 }}>
      <Card
        title="Calidad de datos"
        badge={
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              backgroundColor: "#FEF3C7",
              color: "#92400E",
            }}
          >
            Aproximación honesta
          </span>
        }
      >
        <p
          style={{
            margin: "0 0 12px",
            color: COLORS.textSoft,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Estas señales no son bajo rendimiento. Sirven para separar problemas
          de datos (sin historial, sin cruce con GHL) de miembros que
          efectivamente están vendiendo poco.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <QualityTile
            label="Sin historial este cierre"
            value={quality.membersWithoutHistory}
            share={noHistoryPct}
            hint={`Miembros que no aparecen en el cierre anterior a ${currentLabel}. Pueden ser nuevos o faltarles el cruce.`}
          />
          <QualityTile
            label="Sin cruce GHL ↔ Dropi"
            value={quality.membersWithoutLinkedStudent}
            share={noLinkedPct}
            hint="Miembros Dropi sin contacto CRM vinculado. Aproximación al match faltante."
          />
          <QualityTile
            label="Sin actividad este mes"
            value={quality.membersInactiveThisMonth}
            share={inactivePct}
            hint="Cero ingresos, movimientos, entregas y devoluciones este mes. Puede ser falta de reporte, no necesariamente abandono."
          />
          <QualityTile
            label="Última importación"
            value={lastImportLabel}
            hint={lastImportHint}
            isTextValue
            tone={importAge.status === "stale" ? "warning" : "normal"}
          />
        </div>
      </Card>
    </section>
  );
}

function QualityTile({
  label,
  value,
  share,
  hint,
  isTextValue,
  tone,
}: {
  label: string;
  value: number | string;
  share?: number;
  hint?: string;
  isTextValue?: boolean;
  tone?: "normal" | "warning";
}) {
  const warn = tone === "warning";
  return (
    <div
      style={{
        border: `1px solid ${warn ? "#FCD34D" : COLORS.border}`,
        borderRadius: 10,
        padding: 12,
        backgroundColor: warn ? "#FEF3C7" : COLORS.background,
      }}
    >
      <p style={eyebrowStyle()}>{label}</p>
      <p
        style={{
          margin: "6px 0 0",
          fontSize: isTextValue ? 16 : 22,
          fontWeight: 800,
          color: COLORS.text,
        }}
      >
        {typeof value === "number" ? value.toLocaleString("es-CO") : value}
        {!isTextValue && share != null ? (
          <span
            style={{
              marginLeft: 6,
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.textMuted,
            }}
          >
            {share}%
          </span>
        ) : null}
      </p>
      {hint ? (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: COLORS.textMuted,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  badge,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
          {subtitle ? (
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: COLORS.textMuted,
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          ) : null}
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
        Aún no hay datos de Dropi cargados
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 520,
        }}
      >
        Importá al menos un cierre semanal o mensual para activar el
        comparativo, las cohortes y los KPIs del Radar.
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
