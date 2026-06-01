// Cohortes mensuales sobre `ordersDelivered` — bloque reutilizable por /radar
// y /crecimiento. Tres tarjetas:
//   - Top N por entregas del mes seleccionado.
//   - Cohorte en caída (alerta · "necesita ayuda") con CTA Abrir DROP por
//     fila — usa la server action de Crecimiento (revalida /radar y
//     /seguimientos también, así que el botón sirve en cualquier contexto).
//   - Cohorte de crecimiento por bandas (default 10/20/30) sobre miembros
//     con `current.ordersDelivered >= deliveredCohortMin`.
//
// El selector de mes es opcional: el host puede ocultarlo si ya controla el
// mes desde otro selector (p. ej. el PeriodSelector mensual del Radar).

import Link from "next/link";
import {
  buildDeclineCohort,
  buildGrowthCohorts,
  buildTopDelivered,
  DROPI_RADAR_THRESHOLDS,
  type DeclineCohortMember,
  type GrowthCohortBucket,
  type RadarMember,
} from "@/lib/comunidad-dropi-radar";
import { COLORS } from "../_lib/tokens";
import type { PeriodMonthly } from "../_lib/crecimiento-data";
import { openDeliveredDropFollowUp } from "../crecimiento/actions";

export interface CohortesSectionProps {
  members: readonly RadarMember[];
  // Etiqueta del mes activo para la cabecera de la sección.
  monthLabel: string;
  // Si se pasa, se renderiza un selector que permite cambiar de mes.
  monthSelector?: {
    availableMonths: ReadonlyArray<PeriodMonthly>;
    currentKey: string;
    formAction: string;
    paramName: string;
    extraHiddenInputs?: ReadonlyArray<{ name: string; value: string }>;
  };
  // Eyebrow corto. Default: "Cohortes mensuales".
  eyebrow?: string;
  // Título. Default: "Cohortes sobre entregas".
  title?: string;
  // CTA opcional debajo del bloque (típicamente para mandar a Seguimientos
  // desde el Radar).
  ctaHref?: string;
  ctaLabel?: string;
}

export function CohortesSection({
  members,
  monthLabel,
  monthSelector,
  eyebrow = "Cohortes mensuales",
  title = "Cohortes sobre entregas",
  ctaHref,
  ctaLabel,
}: CohortesSectionProps) {
  const top = buildTopDelivered(members, DROPI_RADAR_THRESHOLDS.topDeliveredLimit);
  const decline = buildDeclineCohort(members);
  const growth = buildGrowthCohorts(members);

  return (
    <section
      aria-label="Cohortes mensuales sobre entregas"
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
            {title}{" "}
            <span style={{ color: COLORS.textSoft, fontWeight: 600 }}>
              · {monthLabel}
            </span>
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: COLORS.textMuted,
            }}
          >
            Umbral mínimo {DROPI_RADAR_THRESHOLDS.deliveredCohortMin} entregas
            (los miembros por debajo se dejan quietos). Bandas de crecimiento{" "}
            {DROPI_RADAR_THRESHOLDS.growthBandsPct.join(" / ")} %.
          </p>
        </div>
        {monthSelector && monthSelector.availableMonths.length > 1 ? (
          <MonthSelectorForm selector={monthSelector} />
        ) : null}
      </header>

      <TopDeliveredTable members={top} />
      <div style={{ height: 14 }} />
      <DeclineCohortTable rows={decline} />
      <div style={{ height: 14 }} />
      <GrowthCohortsBlock buckets={growth} />

      {ctaHref ? (
        <div style={{ marginTop: 14 }}>
          <Link
            href={ctaHref}
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
            {ctaLabel ?? "Ir a Seguimientos →"}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function MonthSelectorForm({
  selector,
}: {
  selector: NonNullable<CohortesSectionProps["monthSelector"]>;
}) {
  return (
    <form
      method="get"
      action={selector.formAction}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      {selector.extraHiddenInputs?.map((h, i) => (
        <input
          key={`${h.name}-${i}`}
          type="hidden"
          name={h.name}
          value={h.value}
        />
      ))}
      <select
        name={selector.paramName}
        defaultValue={selector.currentKey}
        aria-label="Mes para cohortes"
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
        {selector.availableMonths.map((p) => (
          <option key={p.key} value={p.key}>
            Mes cohortes: {p.label}
          </option>
        ))}
      </select>
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
          headers={[
            "#",
            "Miembro",
            "Entregas",
            "Ingresadas",
            "Devoluciones",
            "Δ entregas vs. mes previo",
          ]}
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
      title="Cohorte en caída · necesita ayuda"
      badge={
        <span style={alertBadgeStyle()}>
          {rows.length} miembro{rows.length === 1 ? "" : "s"}
        </span>
      }
      subtitle={`Previo ≥ ${DROPI_RADAR_THRESHOLDS.deliveredCohortMin} entregas y delta negativo este mes. Orden por pérdida absoluta. CTA Abrir DROP genera el seguimiento y queda visible en /seguimientos.`}
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
