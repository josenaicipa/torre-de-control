import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import { ImportUploader } from "./_components/ImportUploader";
import { ResetPanel } from "./_components/ResetPanel";

export const dynamic = "force-dynamic";

export default async function ImportacionesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const batches = await prisma.dropiImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const canUpload = actor.role === "ADMIN" || actor.role === "OPERATOR";
  const isAdmin = actor.role === "ADMIN";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", color: COLORS.text }}>
      <SubNav />
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
          Importaciones de Dropi
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            color: COLORS.textSoft,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Sube un archivo CSV exportado desde Dropi (semanal o mensual). El
          sistema mostrará una vista previa con las filas detectadas, validará
          duplicados por hash, y solo confirmará tras tu aprobación.
        </p>
      </header>

      {canUpload && <ImportUploader />}

      <section style={{ marginTop: 22 }}>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: COLORS.textSoft,
          }}
        >
          Historial
        </h2>
        {batches.length === 0 ? (
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
            Aún no hay importaciones.
          </div>
        ) : (
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
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead style={{ backgroundColor: COLORS.background }}>
                  <tr>
                    <Th>Archivo</Th>
                    <Th>Tipo</Th>
                    <Th>Periodo</Th>
                    <Th>País</Th>
                    <Th>Filas</Th>
                    <Th>Estado</Th>
                    <Th>Subido por</Th>
                    <Th>Fecha</Th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr
                      key={b.id}
                      style={{ borderTop: `1px solid ${COLORS.border}` }}
                    >
                      <Td>
                        <span
                          title={b.fileName}
                          style={{
                            display: "inline-block",
                            maxWidth: 240,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            verticalAlign: "bottom",
                          }}
                        >
                          {b.fileName}
                        </span>
                      </Td>
                      <Td>{b.reportType === "WEEKLY" ? "Semanal" : "Mensual"}</Td>
                      <Td>
                        {b.reportType === "WEEKLY"
                          ? b.periodStart && b.periodEnd
                            ? `${b.periodStart.toISOString().slice(0, 10)} → ${b.periodEnd
                                .toISOString()
                                .slice(0, 10)}`
                            : "—"
                          : b.year && b.month
                          ? `${b.year}-${String(b.month).padStart(2, "0")}`
                          : "—"}
                      </Td>
                      <Td>{b.country ?? "—"}</Td>
                      <Td>
                        {b.rowsProcessed}/{b.rowsTotal}
                        {b.rowsFailed > 0 && (
                          <span style={{ color: COLORS.danger, marginLeft: 6 }}>
                            · {b.rowsFailed} con error
                          </span>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={b.status} />
                      </Td>
                      <Td>{b.uploadedBy?.name ?? b.uploadedBy?.email ?? "—"}</Td>
                      <Td>{b.createdAt.toISOString().slice(0, 10)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {isAdmin && <ResetPanel />}
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
  return <td style={{ padding: "8px 12px" }}>{children}</td>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: "Pendiente",
    PREVIEW_READY: "Vista previa lista",
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
