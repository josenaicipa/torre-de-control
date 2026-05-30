import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { COLORS, SEGMENT_LABELS, SEGMENT_COLORS } from "./_lib/tokens";
import { SubNav } from "./_components/SubNav";

export const dynamic = "force-dynamic";

export default async function ComunidadDropiHome() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [
    totalMembers,
    activeMembers,
    linkedMembers,
    zeroSales,
    dropping,
    highReturn,
    topPerformers,
    openFollowUps,
    countries,
    recentImports,
    recentMembers,
  ] = await Promise.all([
    prisma.dropiCommunityMember.count(),
    prisma.dropiCommunityMember.count({ where: { currentStatus: "ACTIVE" } }),
    prisma.dropiCommunityMember.count({
      where: { linkedStudentId: { not: null } },
    }),
    prisma.dropiCommunityMember.count({
      where: { currentSegment: "ZERO_SALES" },
    }),
    prisma.dropiCommunityMember.count({
      where: { currentSegment: "DROPPING" },
    }),
    prisma.dropiCommunityMember.count({
      where: { currentSegment: "HIGH_RETURN_RISK" },
    }),
    prisma.dropiCommunityMember.count({
      where: { currentSegment: "TOP_PERFORMER" },
    }),
    prisma.dropiFollowUp.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.dropiCommunityMember.groupBy({
      by: ["country"],
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 8,
    }),
    prisma.dropiImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.dropiCommunityMember.findMany({
      orderBy: { lastReportedAt: "desc" },
      take: 6,
      where: { currentSegment: { not: null } },
    }),
  ]);

  const isEmpty = totalMembers === 0;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
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
          Módulo Comunidad Dropi
        </p>
        <h1
          style={{
            margin: "4px 0 0",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          Tablero de la comunidad
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            color: COLORS.textSoft,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Vista operativa de los vendedores Dropi reportados por país. Los
          segmentos y prioridades se actualizan después de cada importación.
        </p>
      </header>

      <SubNav />

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <Kpi label="Total miembros" value={totalMembers} />
            <Kpi label="Activos" value={activeMembers} />
            <Kpi label="Vinculados a Estudiante" value={linkedMembers} />
            <Kpi
              label="Sin ventas"
              value={zeroSales}
              accent={COLORS.danger}
              href="/comunidad-dropi/miembros?segment=ZERO_SALES"
            />
            <Kpi
              label="En caída"
              value={dropping}
              accent={COLORS.danger}
              href="/comunidad-dropi/miembros?segment=DROPPING"
            />
            <Kpi
              label="Devoluciones altas"
              value={highReturn}
              accent={COLORS.warning}
              href="/comunidad-dropi/miembros?segment=HIGH_RETURN_RISK"
            />
            <Kpi
              label="Mejores vendedores"
              value={topPerformers}
              accent={COLORS.success}
              href="/comunidad-dropi/miembros?segment=TOP_PERFORMER"
            />
            <Kpi
              label="Seguimientos abiertos"
              value={openFollowUps}
              href="/comunidad-dropi/seguimientos"
            />
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            <Card title="Distribución por país">
              {countries.length === 0 ? (
                <Empty text="Aún no hay datos por país." />
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {countries.map((c) => (
                    <li
                      key={c.country ?? "unknown"}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        fontSize: 14,
                        borderBottom: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <span style={{ color: COLORS.text }}>
                        {c.country ?? "—"}
                      </span>
                      <span style={{ color: COLORS.textSoft, fontWeight: 600 }}>
                        {c._count._all}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Últimas importaciones">
              {recentImports.length === 0 ? (
                <Empty text="Aún no hay importaciones." />
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {recentImports.map((batch) => (
                    <li
                      key={batch.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: `1px solid ${COLORS.border}`,
                        fontSize: 13,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            color: COLORS.text,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {batch.fileName}
                        </span>
                        <StatusBadge status={batch.status} />
                      </div>
                      <div
                        style={{
                          color: COLORS.textMuted,
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        {batch.reportType === "WEEKLY"
                          ? "Semanal"
                          : "Mensual"}{" "}
                        · {batch.rowsProcessed}/{batch.rowsTotal} filas
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Miembros recientes con segmento">
              {recentMembers.length === 0 ? (
                <Empty text="Aún no se han calculado segmentos." />
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {recentMembers.map((m) => (
                    <li
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom: `1px solid ${COLORS.border}`,
                        fontSize: 13,
                      }}
                    >
                      <Link
                        href={`/comunidad-dropi/miembros/${m.id}`}
                        style={{
                          color: COLORS.text,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        {m.fullName ?? m.email ?? m.phone ?? m.id}
                      </Link>
                      {m.currentSegment && (
                        <SegmentBadge segment={m.currentSegment} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: number;
  accent?: string;
  href?: string;
}) {
  const inner = (
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
          fontSize: 26,
          fontWeight: 800,
          color: accent ?? COLORS.text,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
    </div>
  );
  return href ? (
    <Link
      href={href}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      {inner}
    </Link>
  ) : (
    inner
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

function Empty({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>{text}</p>
  );
}

function SegmentBadge({ segment }: { segment: string }) {
  const colors = SEGMENT_COLORS[segment] ?? {
    bg: "#F1F5F9",
    text: "#475569",
  };
  return (
    <span
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {SEGMENT_LABELS[segment] ?? segment}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    PREVIEW_READY: "Vista previa",
    CONFIRMING: "Confirmando",
    COMPLETED: "Confirmada",
    ERRORED: "Con error",
  };
  const colors: Record<string, { bg: string; text: string }> = {
    PENDING: { bg: "#F1F5F9", text: "#475569" },
    PREVIEW_READY: { bg: "#FEF3C7", text: "#92400E" },
    CONFIRMING: { bg: "#FEF3C7", text: "#92400E" },
    COMPLETED: { bg: "#DCFCE7", text: "#166534" },
    ERRORED: { bg: "#FEE2E2", text: "#991B1B" },
  };
  const c = colors[status] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <span
      style={{
        backgroundColor: c.bg,
        color: c.text,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {labels[status] ?? status}
    </span>
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
        Aún no hay miembros en la comunidad
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        Sube tu primer reporte de Dropi para empezar a ver miembros,
        segmentos y seguimientos automáticos.
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
