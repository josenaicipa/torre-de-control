import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  buildMemberDiagnostic,
  type MemberDiagnostic,
} from "@/lib/comunidad-dropi-analytics";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
} from "../../_lib/tokens";
import { SubNav } from "../../_components/SubNav";

export const dynamic = "force-dynamic";

export default async function MiembroDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { id } = await params;

  const member = await prisma.dropiCommunityMember.findUnique({
    where: { id },
    include: {
      linkedStudent: {
        select: { id: true, fullName: true, email: true, status: true },
      },
      weeklyMetrics: { orderBy: { periodStart: "desc" }, take: 26 },
      monthlyMetrics: {
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 12,
      },
      followUps: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!member) notFound();

  const diagnostic = buildMemberDiagnostic({
    member: {
      id: member.id,
      fullName: member.fullName,
      email: member.email,
      phone: member.phone,
      country: member.country,
      currentSegment: member.currentSegment,
      currentPriority: member.currentPriority,
      currentStatus: member.currentStatus,
      firstReportedAt: member.firstReportedAt,
      lastReportedAt: member.lastReportedAt,
    },
    weekly: member.weeklyMetrics.map((w) => ({
      periodStart: w.periodStart,
      periodEnd: w.periodEnd,
      ordersEntered: w.ordersEntered,
      ordersMoved: w.ordersMoved,
      ordersDelivered: w.ordersDelivered,
      ordersReturned: w.ordersReturned,
      deltaOrdersPercent:
        w.deltaOrdersPercent == null ? null : Number(w.deltaOrdersPercent),
    })),
    monthly: member.monthlyMetrics.map((m) => ({
      year: m.year,
      month: m.month,
      ordersEntered: m.ordersEntered,
      ordersMoved: m.ordersMoved,
      ordersDelivered: m.ordersDelivered,
      ordersReturned: m.ordersReturned,
    })),
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", color: COLORS.text }}>
      <SubNav />
      <div style={{ marginBottom: 8 }}>
        <Link
          href="/comunidad-dropi/miembros"
          style={{
            fontSize: 13,
            color: COLORS.textSoft,
            textDecoration: "none",
          }}
        >
          ← Volver a Miembros
        </Link>
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
          {member.fullName ?? "Miembro sin nombre"}
        </h1>
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            color: COLORS.textSoft,
            fontSize: 13,
          }}
        >
          {member.email && <span>{member.email}</span>}
          {member.phone && <span>{member.phone}</span>}
          {member.country && <span>País: {member.country}</span>}
          {member.dropiExternalId && (
            <span>Dropi ID: {member.dropiExternalId}</span>
          )}
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {member.currentSegment && (
            <SegmentBadge segment={member.currentSegment} />
          )}
          {member.currentPriority && (
            <PriorityBadge priority={member.currentPriority} />
          )}
          <StatusBadge status={member.currentStatus} />
        </div>
      </header>

      <DiagnosticSection diagnostic={diagnostic} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <Card title="Estudiante vinculado">
          {member.linkedStudent ? (
            <div>
              <Link
                href={`/operaciones/estudiantes/${member.linkedStudent.id}`}
                style={{
                  color: COLORS.brand,
                  fontWeight: 700,
                  textDecoration: "none",
                  fontSize: 15,
                }}
              >
                {member.linkedStudent.fullName}
              </Link>
              <p
                style={{
                  margin: "4px 0 0",
                  color: COLORS.textSoft,
                  fontSize: 12,
                }}
              >
                {member.linkedStudent.email} · estado{" "}
                {member.linkedStudent.status}
              </p>
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                color: COLORS.textMuted,
                fontSize: 13,
              }}
            >
              Sin vínculo a un estudiante 1-1. El vínculo es opcional y se
              gestiona desde la API.
            </p>
          )}
        </Card>

        <Card title="Notas internas">
          <p
            style={{
              margin: 0,
              color: member.notes ? COLORS.text : COLORS.textMuted,
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {member.notes ?? "Sin notas."}
          </p>
        </Card>

        <Card title="Primer / último reporte">
          <p style={{ margin: 0, fontSize: 13, color: COLORS.text }}>
            Primero:{" "}
            {member.firstReportedAt
              ? member.firstReportedAt.toISOString().slice(0, 10)
              : "—"}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              color: COLORS.text,
            }}
          >
            Último:{" "}
            {member.lastReportedAt
              ? member.lastReportedAt.toISOString().slice(0, 10)
              : "—"}
          </p>
        </Card>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={sectionTitleStyle()}>Historial semanal</h2>
        {member.weeklyMetrics.length === 0 ? (
          <EmptyCard text="Sin métricas semanales registradas." />
        ) : (
          <MetricsTable rows={member.weeklyMetrics} variant="weekly" />
        )}
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={sectionTitleStyle()}>Historial mensual</h2>
        {member.monthlyMetrics.length === 0 ? (
          <EmptyCard text="Sin métricas mensuales registradas." />
        ) : (
          <MetricsTable rows={member.monthlyMetrics} variant="monthly" />
        )}
      </section>

      <section>
        <h2 style={sectionTitleStyle()}>Seguimientos</h2>
        {member.followUps.length === 0 ? (
          <EmptyCard text="No hay seguimientos para este miembro." />
        ) : (
          <div
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
            >
              <thead style={{ backgroundColor: COLORS.background }}>
                <tr>
                  <Th>Motivo</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado</Th>
                  <Th>Asignado</Th>
                  <Th>Creado</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {member.followUps.map((f) => (
                  <tr
                    key={f.id}
                    style={{ borderTop: `1px solid ${COLORS.border}` }}
                  >
                    <Td>{FOLLOW_UP_REASON_LABELS[f.reason] ?? f.reason}</Td>
                    <Td>
                      <PriorityBadge priority={f.priority} />
                    </Td>
                    <Td>{FOLLOW_UP_STATUS_LABELS[f.status] ?? f.status}</Td>
                    <Td>
                      {f.assignedTo
                        ? f.assignedTo.name ?? f.assignedTo.email
                        : "—"}
                    </Td>
                    <Td>{f.createdAt.toISOString().slice(0, 10)}</Td>
                    <Td>
                      <span style={{ color: COLORS.textSoft }}>
                        {f.notes ?? f.suggestedAction ?? "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
        padding: 14,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.textSoft,
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

const TREND_LABELS: Record<MemberDiagnostic["trend"], string> = {
  UP: "En subida",
  DOWN: "En bajada",
  STABLE: "Estable",
  NEW: "Primera medición",
  ZERO: "Sin ventas",
  INSUFFICIENT_DATA: "Datos insuficientes",
};

const TREND_COLORS: Record<MemberDiagnostic["trend"], string> = {
  UP: COLORS.success,
  DOWN: COLORS.danger,
  STABLE: COLORS.textSoft,
  NEW: COLORS.textSoft,
  ZERO: COLORS.warning,
  INSUFFICIENT_DATA: COLORS.textMuted,
};

function DiagnosticSection({
  diagnostic,
}: {
  diagnostic: MemberDiagnostic;
}) {
  const hasInsights =
    diagnostic.highlights.length +
      diagnostic.warnings.length +
      diagnostic.suggestions.length >
    0;
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 18,
      }}
      aria-label="Diagnóstico inteligente"
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
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
          Diagnóstico inteligente
        </h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: TREND_COLORS[diagnostic.trend],
            backgroundColor: COLORS.background,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          {TREND_LABELS[diagnostic.trend]}
        </span>
      </div>

      <p
        style={{
          margin: "10px 0 0",
          fontSize: 14,
          color: COLORS.text,
          lineHeight: 1.5,
        }}
      >
        {diagnostic.summary}
      </p>

      {diagnostic.latestPeriodLabel ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          Último período: {diagnostic.latestPeriodLabel} · {diagnostic.periodsAnalysed}{" "}
          semana{diagnostic.periodsAnalysed === 1 ? "" : "s"} analizada
          {diagnostic.periodsAnalysed === 1 ? "" : "s"}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <DiagnosticMetric
          label="Tasa de movimiento"
          value={`${diagnostic.rates.movementRate}%`}
        />
        <DiagnosticMetric
          label="Entrega operativa entregadas/movidas"
          value={`${diagnostic.rates.deliveryRate}%`}
        />
        <DiagnosticMetric
          label="Tasa de devolución"
          value={`${diagnostic.rates.returnRate}%`}
        />
        <DiagnosticMetric
          label="Pedidos ingresados"
          value={String(diagnostic.totals.ordersEntered)}
          sub={
            diagnostic.delta.pct != null
              ? `${diagnostic.delta.pct >= 0 ? "▲" : "▼"} ${Math.abs(
                  diagnostic.delta.pct,
                )}% vs. anterior`
              : "Sin período previo"
          }
        />
      </div>

      {hasInsights ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 12,
          }}
        >
          <InsightList
            title="Buenas señales"
            items={diagnostic.highlights}
            color={COLORS.success}
            emptyText="Sin señales positivas aún."
          />
          <InsightList
            title="Alertas"
            items={diagnostic.warnings}
            color={COLORS.danger}
            emptyText="Sin alertas."
          />
          <InsightList
            title="Sugerencias"
            items={diagnostic.suggestions}
            color={COLORS.brand}
            emptyText="Sin sugerencias para este período."
          />
        </div>
      ) : (
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            color: COLORS.textMuted,
          }}
        >
          No hay observaciones automáticas para este miembro todavía.
        </p>
      )}
    </section>
  );
}

function DiagnosticMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: COLORS.background,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: 12,
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
          margin: "6px 0 0",
          fontSize: 20,
          fontWeight: 800,
          color: COLORS.text,
        }}
      >
        {value}
      </p>
      {sub ? (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 11,
            color: COLORS.textMuted,
          }}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function InsightList({
  title,
  items,
  color,
  emptyText,
}: {
  title: string;
  items: string[];
  color: string;
  emptyText: string;
}) {
  return (
    <div>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color,
        }}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12,
            color: COLORS.textMuted,
          }}
        >
          {emptyText}
        </p>
      ) : (
        <ul
          style={{
            margin: "6px 0 0",
            padding: "0 0 0 16px",
            color: COLORS.text,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {items.map((it, idx) => (
            <li key={idx}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 12,
        padding: 18,
        color: COLORS.textMuted,
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

interface WeeklyRow {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  calculatedSegment: string | null;
  calculatedPriority: string | null;
}

interface MonthlyRow {
  id: string;
  year: number;
  month: number;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  trend: string | null;
  calculatedSegment: string | null;
  calculatedPriority: string | null;
}

function MetricsTable({
  rows,
  variant,
}: {
  rows: WeeklyRow[] | MonthlyRow[];
  variant: "weekly" | "monthly";
}) {
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead style={{ backgroundColor: COLORS.background }}>
            <tr>
              <Th>{variant === "weekly" ? "Semana" : "Mes"}</Th>
              <Th>Ingresadas</Th>
              <Th>Movidas</Th>
              <Th>Entregadas</Th>
              <Th>Devueltas</Th>
              <Th>Segmento</Th>
              <Th>Prioridad</Th>
            </tr>
          </thead>
          <tbody>
            {(rows as Array<WeeklyRow & MonthlyRow>).map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <Td>
                  {variant === "weekly"
                    ? `${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd
                        .toISOString()
                        .slice(0, 10)}`
                    : `${r.year}-${String(r.month).padStart(2, "0")}`}
                </Td>
                <Td>{r.ordersEntered}</Td>
                <Td>{r.ordersMoved}</Td>
                <Td>{r.ordersDelivered}</Td>
                <Td>{r.ordersReturned}</Td>
                <Td>
                  {r.calculatedSegment ? (
                    <SegmentBadge segment={r.calculatedSegment} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {r.calculatedPriority ? (
                    <PriorityBadge priority={r.calculatedPriority} />
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: "left",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: COLORS.textSoft,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>{children}</td>;
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
      }}
    >
      {SEGMENT_LABELS[segment] ?? segment}
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

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "Activo",
    WATCHLIST: "Observación",
    INACTIVE: "Inactivo",
  };
  const colors: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: "#DCFCE7", text: "#166534" },
    WATCHLIST: { bg: "#FEF3C7", text: "#92400E" },
    INACTIVE: { bg: "#F1F5F9", text: "#475569" },
  };
  const c = colors[status] ?? { bg: "#F1F5F9", text: "#475569" };
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
    >
      {labels[status] ?? status}
    </span>
  );
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: COLORS.textSoft,
  };
}
