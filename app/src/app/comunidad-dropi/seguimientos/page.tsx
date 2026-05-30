import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  PRIORITY_LABELS,
} from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import {
  FollowUpsTable,
  type FollowUpRow,
} from "./_components/FollowUpsTable";

export const dynamic = "force-dynamic";

interface SearchParams {
  status?: "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";
  priority?: "P1" | "P2" | "P3" | "P4";
  reason?: string;
  page?: string;
}

export default async function SeguimientosPage({
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
  where.status = sp.status ?? { in: ["OPEN", "IN_PROGRESS"] };
  if (sp.priority) where.priority = sp.priority;
  if (sp.reason) where.reason = sp.reason;

  const [items, total, openCount, urgentCount] = await Promise.all([
    prisma.dropiFollowUp.findMany({
      where,
      orderBy: [
        { priority: "asc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        member: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            country: true,
            currentSegment: true,
          },
        },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.dropiFollowUp.count({ where }),
    prisma.dropiFollowUp.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.dropiFollowUp.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        priority: "P1",
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows: FollowUpRow[] = items.map((f) => ({
    id: f.id,
    reason: f.reason,
    priority: f.priority,
    status: f.status,
    suggestedAction: f.suggestedAction,
    notes: f.notes,
    result: f.result,
    dueDate: f.dueDate ? f.dueDate.toISOString() : null,
    contactedAt: f.contactedAt ? f.contactedAt.toISOString() : null,
    nextActionAt: f.nextActionAt ? f.nextActionAt.toISOString() : null,
    assignedName: f.assignedTo
      ? f.assignedTo.name ?? f.assignedTo.email ?? null
      : null,
    member: {
      id: f.member.id,
      fullName: f.member.fullName,
      email: f.member.email,
      phone: f.member.phone,
      country: f.member.country,
    },
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <SubNav />
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            Seguimientos
          </h1>
          <p style={{ margin: "4px 0 0", color: COLORS.textSoft, fontSize: 13 }}>
            {openCount} abiertos · {urgentCount} urgentes (P1).
          </p>
        </div>
      </header>

      <form
        method="get"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}
      >
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          style={inputStyle()}
        >
          <option value="">Abiertos y en curso</option>
          <option value="OPEN">Solo abiertos</option>
          <option value="IN_PROGRESS">Solo en curso</option>
          <option value="DONE">Hechos</option>
          <option value="DISMISSED">Descartados</option>
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
          name="reason"
          defaultValue={sp.reason ?? ""}
          style={inputStyle()}
        >
          <option value="">Todos los motivos</option>
          {Object.entries(FOLLOW_UP_REASON_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" style={primaryButton()}>
          Filtrar
        </button>
      </form>

      <FollowUpsTable items={rows} />

      {totalPages > 1 && (
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
              <Link href={pageHref(sp, page - 1)} style={ghostButton()}>
                ← Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(sp, page + 1)} style={ghostButton()}>
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pageHref(sp: SearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page") continue;
    if (v) params.set(k, String(v));
  }
  params.set("page", String(page));
  return `?${params.toString()}`;
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 13,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontFamily: "inherit",
  };
}

function primaryButton(): React.CSSProperties {
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

function ghostButton(): React.CSSProperties {
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
