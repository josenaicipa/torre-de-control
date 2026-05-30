import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  COLORS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
} from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

interface SearchParams {
  search?: string;
  country?: string;
  segment?: string;
  priority?: "P1" | "P2" | "P3" | "P4";
  status?: "ACTIVE" | "INACTIVE" | "WATCHLIST";
  linked?: "yes" | "no";
  page?: string;
}

export default async function MiembrosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 50;

  const where: Record<string, unknown> = {};
  if (sp.search) {
    where.OR = [
      { fullName: { contains: sp.search, mode: "insensitive" } },
      { email: { contains: sp.search, mode: "insensitive" } },
      { phone: { contains: sp.search } },
      { dropiExternalId: { contains: sp.search } },
    ];
  }
  if (sp.country) where.country = sp.country;
  if (sp.segment) where.currentSegment = sp.segment;
  if (sp.priority) where.currentPriority = sp.priority;
  if (sp.status) where.currentStatus = sp.status;
  if (sp.linked === "yes") where.linkedStudentId = { not: null };
  if (sp.linked === "no") where.linkedStudentId = null;

  const [items, total, countryList] = await Promise.all([
    prisma.dropiCommunityMember.findMany({
      where,
      orderBy: [{ lastReportedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        linkedStudent: { select: { id: true, fullName: true } },
      },
    }),
    prisma.dropiCommunityMember.count({ where }),
    prisma.dropiCommunityMember.groupBy({
      by: ["country"],
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", color: COLORS.text }}>
      <SubNav />
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            Miembros de la comunidad
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: COLORS.textSoft,
              fontSize: 13,
            }}
          >
            {total} {total === 1 ? "miembro" : "miembros"} en la base.
          </p>
        </div>
      </div>

      <form
        method="get"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <input
          type="text"
          name="search"
          placeholder="Buscar nombre, correo, teléfono o ID Dropi"
          defaultValue={sp.search ?? ""}
          style={inputStyle("260px")}
        />
        <select
          name="country"
          defaultValue={sp.country ?? ""}
          style={inputStyle()}
        >
          <option value="">Todos los países</option>
          {countryList
            .filter((c) => c.country)
            .map((c) => (
              <option key={c.country ?? ""} value={c.country ?? ""}>
                {c.country} ({c._count._all})
              </option>
            ))}
        </select>
        <select
          name="segment"
          defaultValue={sp.segment ?? ""}
          style={inputStyle()}
        >
          <option value="">Todos los segmentos</option>
          {Object.entries(SEGMENT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="priority"
          defaultValue={sp.priority ?? ""}
          style={inputStyle()}
        >
          <option value="">Todas las prioridades</option>
          {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          style={inputStyle()}
        >
          <option value="">Cualquier estado</option>
          <option value="ACTIVE">Activos</option>
          <option value="WATCHLIST">En observación</option>
          <option value="INACTIVE">Inactivos</option>
        </select>
        <select
          name="linked"
          defaultValue={sp.linked ?? ""}
          style={inputStyle()}
        >
          <option value="">Vínculo con Estudiante</option>
          <option value="yes">Vinculados</option>
          <option value="no">Sin vincular</option>
        </select>
        <button type="submit" style={buttonStyle()}>
          Filtrar
        </button>
      </form>

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
                <Th>Nombre</Th>
                <Th>Contacto</Th>
                <Th>País</Th>
                <Th>Segmento</Th>
                <Th>Prioridad</Th>
                <Th>Estudiante</Th>
                <Th>Último reporte</Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: COLORS.textMuted,
                    }}
                  >
                    No hay miembros que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                items.map((m) => (
                  <tr
                    key={m.id}
                    style={{ borderTop: `1px solid ${COLORS.border}` }}
                  >
                    <Td>
                      <Link
                        href={`/comunidad-dropi/miembros/${m.id}`}
                        style={{
                          color: COLORS.text,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        {m.fullName ?? "—"}
                      </Link>
                    </Td>
                    <Td>
                      <span style={{ color: COLORS.textSoft }}>
                        {m.email ?? m.phone ?? "—"}
                      </span>
                    </Td>
                    <Td>{m.country ?? "—"}</Td>
                    <Td>
                      {m.currentSegment ? (
                        <SegmentBadge segment={m.currentSegment} />
                      ) : (
                        <span style={{ color: COLORS.textMuted }}>—</span>
                      )}
                    </Td>
                    <Td>
                      {m.currentPriority ? (
                        <PriorityBadge priority={m.currentPriority} />
                      ) : (
                        <span style={{ color: COLORS.textMuted }}>—</span>
                      )}
                    </Td>
                    <Td>
                      {m.linkedStudent ? (
                        <Link
                          href={`/operaciones/estudiantes/${m.linkedStudent.id}`}
                          style={{ color: COLORS.brand, textDecoration: "none" }}
                        >
                          {m.linkedStudent.fullName}
                        </Link>
                      ) : (
                        <span style={{ color: COLORS.textMuted }}>—</span>
                      )}
                    </Td>
                    <Td>
                      {m.lastReportedAt
                        ? m.lastReportedAt.toISOString().slice(0, 10)
                        : "—"}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} sp={sp} />}
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
    >
      {priority}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: SearchParams;
}) {
  const qs = (n: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page") continue;
      if (v) params.set(k, String(v));
    }
    params.set("page", String(n));
    return `?${params.toString()}`;
  };
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 13,
        color: COLORS.textSoft,
      }}
    >
      <span>
        Página {page} de {totalPages}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {page > 1 && (
          <Link href={qs(page - 1)} style={buttonStyle("ghost")}>
            ← Anterior
          </Link>
        )}
        {page < totalPages && (
          <Link href={qs(page + 1)} style={buttonStyle("ghost")}>
            Siguiente →
          </Link>
        )}
      </div>
    </div>
  );
}

function inputStyle(width?: string): React.CSSProperties {
  return {
    padding: "8px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 13,
    width: width ?? "auto",
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontFamily: "inherit",
  };
}

function buttonStyle(variant?: "ghost"): React.CSSProperties {
  if (variant === "ghost") {
    return {
      padding: "6px 12px",
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      backgroundColor: COLORS.surface,
      color: COLORS.text,
      textDecoration: "none",
    };
  }
  return {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    cursor: "pointer",
  };
}
