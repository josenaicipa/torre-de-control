import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  COLORS,
  CONTACT_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  FOLLOW_UP_REASON_LABELS,
  PRIORITY_LABELS,
} from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import {
  BUCKET_COLORS,
  addDays,
  buildFollowUpsHref,
  kpiHref,
  parseFollowUpsFilters,
  startOfUtcDay,
} from "../_lib/follow-ups";
import {
  FollowUpsTable,
  type AssignableUser,
  type FollowUpRow,
} from "./_components/FollowUpsTable";
import { ViewToggle } from "./_components/ViewToggle";
import { buildKanbanHref } from "../_lib/kanban";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function flattenParams(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) out[key] = value[0];
    else out[key] = value;
  }
  return out;
}

export default async function SeguimientosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flattenParams(await searchParams);
  const filters = parseFollowUpsFilters(sp);
  const pageSize = 50;

  const canAssign = actor.role === "ADMIN" || actor.role === "OPERATOR";
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekEnd = addDays(todayStart, 8);

  const where: Record<string, unknown> = {};
  where.status =
    filters.status === "OPEN_AND_PROGRESS"
      ? { in: ["OPEN", "IN_PROGRESS"] }
      : filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.reason) where.reason = filters.reason;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.contactChannel) where.contactChannel = filters.contactChannel;
  if (filters.mine) where.assignedToId = actor.userId;
  else if (filters.unassigned) where.assignedToId = null;
  else if (filters.assignedToId) where.assignedToId = filters.assignedToId;

  if (filters.bucket === "OVERDUE") where.dueDate = { lt: todayStart };
  else if (filters.bucket === "TODAY")
    where.dueDate = { gte: todayStart, lt: tomorrowStart };
  else if (filters.bucket === "THIS_WEEK")
    where.dueDate = { gte: tomorrowStart, lt: weekEnd };
  else if (filters.bucket === "UPCOMING") where.dueDate = { gte: weekEnd };
  else if (filters.bucket === "NO_DATE") where.dueDate = null;

  if (filters.country) {
    where.member = { country: filters.country };
  }

  if (filters.q) {
    const q = filters.q;
    const memberFilter = (where.member as Record<string, unknown>) ?? {};
    memberFilter.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
    where.member = memberFilter;
  }

  const baseOpen = {
    status: { in: ["OPEN", "IN_PROGRESS"] as ("OPEN" | "IN_PROGRESS")[] },
  };

  const [
    items,
    total,
    openCount,
    urgentCount,
    todayCount,
    overdueCount,
    mineCount,
    unassignedCount,
    countriesRaw,
    assignableUsers,
  ] = await Promise.all([
    prisma.dropiFollowUp.findMany({
      where,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      skip: (filters.page - 1) * pageSize,
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
    prisma.dropiFollowUp.count({ where: baseOpen }),
    prisma.dropiFollowUp.count({ where: { ...baseOpen, priority: "P1" } }),
    prisma.dropiFollowUp.count({
      where: { ...baseOpen, dueDate: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.dropiFollowUp.count({
      where: { ...baseOpen, dueDate: { lt: todayStart } },
    }),
    prisma.dropiFollowUp.count({
      where: { ...baseOpen, assignedToId: actor.userId },
    }),
    prisma.dropiFollowUp.count({
      where: { ...baseOpen, assignedToId: null },
    }),
    prisma.dropiCommunityMember.groupBy({
      by: ["country"],
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 20,
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["ADMIN", "OPERATOR", "MENTOR"] },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
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
    outcome: f.outcome ?? null,
    contactChannel: f.contactChannel ?? null,
    snoozedUntil: f.snoozedUntil ? f.snoozedUntil.toISOString() : null,
    dueDate: f.dueDate ? f.dueDate.toISOString() : null,
    contactedAt: f.contactedAt ? f.contactedAt.toISOString() : null,
    nextActionAt: f.nextActionAt ? f.nextActionAt.toISOString() : null,
    assignedToId: f.assignedTo ? f.assignedTo.id : null,
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

  const countries = countriesRaw
    .map((c) => c.country)
    .filter((c): c is string => Boolean(c && c.trim()));

  const assignable: AssignableUser[] = assignableUsers.map((u) => ({
    id: u.id,
    label: u.name ?? u.email ?? u.id,
  }));

  const kpis: Array<{
    key: string;
    label: string;
    value: number;
    href: string;
    bucket?: keyof typeof BUCKET_COLORS;
    active: boolean;
    accent: string;
  }> = [
    {
      key: "open",
      label: "Abiertos / en curso",
      value: openCount,
      href: kpiHref({}),
      active:
        filters.status === "OPEN_AND_PROGRESS" &&
        !filters.priority &&
        !filters.bucket &&
        !filters.mine &&
        !filters.unassigned,
      accent: COLORS.brand,
    },
    {
      key: "overdue",
      label: "Vencidos",
      value: overdueCount,
      href: kpiHref({ bucket: "OVERDUE" }),
      bucket: "OVERDUE",
      active: filters.bucket === "OVERDUE",
      accent: BUCKET_COLORS.OVERDUE.border,
    },
    {
      key: "today",
      label: "Para hoy",
      value: todayCount,
      href: kpiHref({ bucket: "TODAY" }),
      bucket: "TODAY",
      active: filters.bucket === "TODAY",
      accent: BUCKET_COLORS.TODAY.border,
    },
    {
      key: "urgent",
      label: "Urgentes (P1)",
      value: urgentCount,
      href: kpiHref({ priority: "P1" }),
      active: filters.priority === "P1" && !filters.bucket,
      accent: "#FCA5A5",
    },
    {
      key: "mine",
      label: "Asignados a mí",
      value: mineCount,
      href: kpiHref({ mine: "1" }),
      active: filters.mine,
      accent: "#A78BFA",
    },
    {
      key: "unassigned",
      label: "Sin asignar",
      value: unassignedCount,
      href: kpiHref({ unassigned: "1" }),
      active: filters.unassigned,
      accent: "#CBD5E1",
    },
  ];

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
            {openCount} abiertos · {urgentCount} urgentes (P1) · {overdueCount}{" "}
            vencidos.
          </p>
        </div>
        <ViewToggle
          activeView="table"
          tableHref={`/comunidad-dropi/seguimientos${buildFollowUpsHref(filters)}`}
          kanbanHref={`/comunidad-dropi/seguimientos/kanban${buildKanbanHref({
            priority: filters.priority,
            reason: filters.reason,
            q: filters.q,
            country: filters.country,
            assignedToId: filters.assignedToId,
            mine: filters.mine,
            unassigned: filters.unassigned,
          })}`}
        />
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {kpis.map((kpi) => (
          <Link
            key={kpi.key}
            href={kpi.href}
            style={kpiCardStyle(kpi.active, kpi.accent)}
          >
            <span
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: COLORS.textSoft,
              }}
            >
              {kpi.label}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 22,
                fontWeight: 800,
                color: COLORS.text,
                marginTop: 4,
              }}
            >
              {kpi.value}
            </span>
          </Link>
        ))}
      </div>

      <form
        method="get"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}
      >
        <input
          type="text"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Buscar por nombre, email o teléfono"
          style={{ ...inputStyle(), minWidth: 220, flex: "1 1 220px" }}
        />
        <select
          name="status"
          defaultValue={filters.status === "OPEN_AND_PROGRESS" ? "" : filters.status}
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
          defaultValue={filters.priority ?? ""}
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
          defaultValue={filters.reason ?? ""}
          style={inputStyle()}
        >
          <option value="">Todos los motivos</option>
          {Object.entries(FOLLOW_UP_REASON_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="outcome"
          defaultValue={filters.outcome ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por resultado del contacto"
        >
          <option value="">Cualquier resultado</option>
          {Object.entries(FOLLOW_UP_OUTCOME_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="contactChannel"
          defaultValue={filters.contactChannel ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por canal de contacto"
        >
          <option value="">Cualquier canal</option>
          {Object.entries(CONTACT_CHANNEL_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="country"
          defaultValue={filters.country ?? ""}
          style={inputStyle()}
        >
          <option value="">Todos los países</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="assignedToId"
          defaultValue={filters.mine ? "" : filters.assignedToId ?? ""}
          disabled={filters.mine}
          style={inputStyle()}
        >
          <option value="">Cualquier responsable</option>
          {assignable.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: COLORS.textSoft,
          }}
        >
          <input
            type="checkbox"
            name="mine"
            value="1"
            defaultChecked={filters.mine}
          />
          Solo míos
        </label>
        <button type="submit" style={primaryButton()}>
          Filtrar
        </button>
        {(filters.q ||
          filters.country ||
          filters.assignedToId ||
          filters.mine ||
          filters.unassigned ||
          filters.bucket ||
          filters.priority ||
          filters.reason ||
          filters.outcome ||
          filters.contactChannel ||
          filters.status !== "OPEN_AND_PROGRESS") && (
          <Link href={kpiHref({})} style={ghostButton()}>
            Limpiar
          </Link>
        )}
      </form>

      <FollowUpsTable
        items={rows}
        actorUserId={actor.userId}
        canAssign={canAssign}
        assignableUsers={assignable}
        now={now.toISOString()}
      />

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
            Página {filters.page} de {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {filters.page > 1 && (
              <Link
                href={buildFollowUpsHref(filters, { page: String(filters.page - 1) })}
                style={ghostButton()}
              >
                ← Anterior
              </Link>
            )}
            {filters.page < totalPages && (
              <Link
                href={buildFollowUpsHref(filters, { page: String(filters.page + 1) })}
                style={ghostButton()}
              >
                Siguiente →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function kpiCardStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    display: "block",
    padding: "12px 14px",
    border: `1px solid ${active ? accent : COLORS.border}`,
    borderTop: `1px solid ${accent}`,
    borderRadius: 10,
    backgroundColor: active
      ? `color-mix(in srgb, ${accent} 8%, ${COLORS.surface})`
      : COLORS.surface,
    textDecoration: "none",
    color: COLORS.text,
    boxShadow: active ? "0 1px 0 rgba(17,17,16,0.04)" : "none",
  };
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
