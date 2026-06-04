// Pulso Comunidad Dropi — pantalla reina del módulo.
//
// Objetivo de UX: en máximo 5 segundos el operador entiende:
//   1) qué hay que hacer hoy (P1 abiertos, vencidos, para hoy, sin asignar),
//   2) el "Rendimiento de la comunidad": KPIs del período + las cohortes de
//      entregas (Top 20, En caída, En aumento) con su filtro Semana/Mes.
//
// Notas:
//   - La ruta sigue siendo /comunidad-dropi/radar para no romper enlaces.
//   - El selector mensual del Radar (`?period=YYYY-M`) controla el mes activo.
//   - La sección de Rendimiento trae su propio par de selectores
//     (granularidad + período principal + período de comparación). Default:
//     semanal actual vs. semana anterior; si no hay semanas cargadas, cae
//     automáticamente al mes del Radar para no quedar vacía.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { type Radar } from "@/lib/comunidad-dropi-radar";
import { formatMonthRef, loadRadar } from "../_lib/radar-data";
import { loadComparativo, type Granularity } from "../_lib/crecimiento-data";
import { COLORS } from "../_lib/tokens";
import { parsePeriod } from "../_lib/period";
import {
  classifyImportAge,
  type ImportAgeInfo,
} from "../_lib/import-age";
import {
  computeRadarFollowUpStats,
  type RadarFollowUpStats,
} from "../_lib/follow-up-stats";
import { SubNav } from "../_components/SubNav";
import { RadarPeriodFiltro } from "../_components/RadarPeriodFiltro";
import { RendimientoComunidad } from "../_components/RendimientoComunidad";

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

// Extrae `{ year, month }` de un key mensual (`m:YYYY-M`) del filtro único.
// Permite que el contexto mensual del Radar siga al período elegido sin
// depender del `?period=` viejo.
function monthFromCurrentKey(
  current: string | null,
): { year: number; month: number } | null {
  if (!current || !current.startsWith("m:")) return null;
  const [y, m] = current.slice(2).split("-");
  const year = Number.parseInt(y ?? "", 10);
  const month = Number.parseInt(m ?? "", 10);
  if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
  return null;
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
  // El Radar siempre compara contra el período anterior: ignoramos cualquier
  // `?comparison=` viejo en la URL para no forzar una comparación manual.
  const fallbackMonthly =
    year != null && month != null ? { year, month } : null;

  // El contexto mensual (loadRadar) sigue al filtro único: si el operador
  // eligió Mes con `?current=m:YYYY-M`, usamos ese mes; si está en Semana o no
  // eligió mes, caemos al `?period=` viejo o al último mes disponible.
  const monthlyCurrent =
    granularity === "monthly" ? monthFromCurrentKey(currentKey) : null;
  const radarMonth = monthlyCurrent ?? fallbackMonthly ?? {};

  const [{ radar, lastImportAt }, comparativo] = await Promise.all([
    loadRadar(radarMonth),
    loadComparativo({
      granularity,
      currentKey,
      comparisonKey: null,
      fallbackMonthly,
    }),
  ]);
  const importAge = classifyImportAge(lastImportAt);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {radar || comparativo ? (
        <PulsoBody radar={radar} importAge={importAge} comparativo={comparativo} />
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
        En 5 segundos: ¿qué hago hoy? y ¿cómo viene el rendimiento de la
        comunidad? Entregadas es la métrica reina.
      </p>
    </header>
  );
}

async function PulsoBody({
  radar,
  importAge,
  comparativo,
}: {
  radar: Radar | null;
  importAge: ImportAgeInfo;
  comparativo: Awaited<ReturnType<typeof loadComparativo>>;
}) {
  const currentLabel = radar ? formatMonthRef(radar.current) : null;
  const previousLabel =
    radar && radar.previous ? formatMonthRef(radar.previous) : null;

  // Una sola query alimenta el banner "Qué hacer hoy".
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

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        {currentLabel ? (
          <PeriodNote
            currentLabel={currentLabel}
            previousLabel={previousLabel}
            importAge={importAge}
          />
        ) : (
          <ImportAgeBanner importAge={importAge} />
        )}

        {comparativo ? (
          <RadarPeriodFiltro
            comparativo={comparativo}
            formAction="/comunidad-dropi/radar"
          />
        ) : null}
      </div>

      <TodayActionsCard stats={followUpStats} />

      {comparativo ? (
        <RendimientoComunidad comparativo={comparativo} />
      ) : (
        <RendimientoEmpty />
      )}
    </>
  );
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

function PeriodNote({
  currentLabel,
  previousLabel,
  importAge,
}: {
  currentLabel: string;
  previousLabel: string | null;
  importAge: ImportAgeInfo;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, color: COLORS.textSoft }}>
        Mes de referencia: <strong>{currentLabel}</strong>
        {previousLabel ? (
          <>
            {" "}
            · Comparado con <strong>{previousLabel}</strong>
          </>
        ) : null}
      </span>
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

function RendimientoEmpty() {
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
      <p style={eyebrowStyle()}>Rendimiento de la comunidad</p>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 13,
        }}
      >
        Aún no hay períodos cargados para medir el rendimiento. Importá al menos
        un cierre semanal o mensual para activar las entregas, las cohortes y la
        comparación entre períodos.
      </p>
    </section>
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
