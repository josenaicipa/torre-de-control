import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  PRIORITY_LABELS,
} from "../../_lib/tokens";
import { SubNav } from "../../_components/SubNav";
import { buildFollowUpsHref } from "../../_lib/follow-ups";
import {
  KANBAN_STATUS_ORDER,
  buildKanbanHref,
  parseKanbanFilters,
  type KanbanStatus,
} from "../../_lib/kanban";
import {
  KanbanBoard,
} from "./_components/KanbanBoard";
import { ViewToggle } from "../_components/ViewToggle";
import type {
  AssignableUser,
  FollowUpRow,
} from "../_components/FollowUpsTable";

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

// Cap per-column results so a runaway DONE/DISMISSED archive doesn't blow up
// the page. Operators still see "shown / total" in the column header so they
// know to narrow with filters when N is hidden.
const COLUMN_TAKE: Record<KanbanStatus, number> = {
  OPEN: 100,
  IN_PROGRESS: 100,
  DONE: 50,
  DISMISSED: 50,
};

const MEMBER_INCLUDE = {
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
} as const;

export default async function SeguimientosKanbanPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flattenParams(await searchParams);
  const filters = parseKanbanFilters(sp);

  const canAssign = actor.role === "ADMIN" || actor.role === "OPERATOR";

  // Build the shared where clause for every column. The status field is set
  // per-column below.
  const baseWhere: Record<string, unknown> = {};
  if (filters.priority) baseWhere.priority = filters.priority;
  if (filters.reason) baseWhere.reason = filters.reason;
  if (filters.mine) baseWhere.assignedToId = actor.userId;
  else if (filters.unassigned) baseWhere.assignedToId = null;
  else if (filters.assignedToId) baseWhere.assignedToId = filters.assignedToId;

  if (filters.country) {
    baseWhere.member = { country: filters.country };
  }
  if (filters.q) {
    const q = filters.q;
    const memberFilter = (baseWhere.member as Record<string, unknown>) ?? {};
    memberFilter.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
    baseWhere.member = memberFilter;
  }

  // Per-column queries: queue-style ordering for OPEN/IN_PROGRESS so the most
  // urgent work surfaces first; recency-based ordering for DONE/DISMISSED so
  // managers see fresh outcomes near the top of the archive columns.
  const columnQueries = KANBAN_STATUS_ORDER.map(async (status) => {
    const where = { ...baseWhere, status };
    const orderBy =
      status === "OPEN" || status === "IN_PROGRESS"
        ? [
            { dueDate: { sort: "asc", nulls: "last" } as const },
            { priority: "asc" as const },
            { createdAt: "desc" as const },
          ]
        : [{ updatedAt: "desc" as const }];
    const [items, count] = await Promise.all([
      prisma.dropiFollowUp.findMany({
        where,
        orderBy,
        take: COLUMN_TAKE[status],
        include: MEMBER_INCLUDE,
      }),
      prisma.dropiFollowUp.count({ where }),
    ]);
    return { status, items, count };
  });

  const [columns, countriesRaw, assignableUsers] = await Promise.all([
    Promise.all(columnQueries),
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

  const now = new Date();
  const items: FollowUpRow[] = columns.flatMap((col) =>
    col.items.map((f) => ({
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
    })),
  );

  const totals: Record<KanbanStatus, number> = {
    OPEN: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    DISMISSED: 0,
  };
  for (const col of columns) totals[col.status as KanbanStatus] = col.count;

  const countries = countriesRaw
    .map((c) => c.country)
    .filter((c): c is string => Boolean(c && c.trim()));

  const assignable: AssignableUser[] = assignableUsers.map((u) => ({
    id: u.id,
    label: u.name ?? u.email ?? u.id,
  }));

  const hasActiveFilters = Boolean(
    filters.q ||
      filters.country ||
      filters.assignedToId ||
      filters.mine ||
      filters.unassigned ||
      filters.priority ||
      filters.reason,
  );

  // Preserve the kanban filter set when linking back to the table view so
  // managers don't lose their context when switching modes.
  const backToTableHref = `/comunidad-dropi/seguimientos${buildFollowUpsHref({
    priority: filters.priority,
    reason: filters.reason,
    q: filters.q,
    country: filters.country,
    assignedToId: filters.assignedToId,
    mine: filters.mine,
    unassigned: filters.unassigned,
  })}`;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", color: COLORS.text }}>
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
            Seguimientos · Kanban
          </h1>
          <p style={{ margin: "4px 0 0", color: COLORS.textSoft, fontSize: 13 }}>
            {totals.OPEN} abiertos · {totals.IN_PROGRESS} en curso ·{" "}
            {totals.DONE} hechos · {totals.DISMISSED} descartados.
          </p>
        </div>
        <ViewToggle
          activeView="kanban"
          tableHref={backToTableHref}
          kanbanHref={`/comunidad-dropi/seguimientos/kanban${buildKanbanHref(filters)}`}
        />
      </header>

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
          name="priority"
          defaultValue={filters.priority ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por prioridad"
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
          aria-label="Filtrar por motivo"
        >
          <option value="">Todos los motivos</option>
          {Object.entries(FOLLOW_UP_REASON_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="country"
          defaultValue={filters.country ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por país"
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
          aria-label="Filtrar por responsable"
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
        {hasActiveFilters && (
          <Link href={buildKanbanHref({})} style={ghostButton()}>
            Limpiar
          </Link>
        )}
      </form>

      <KanbanBoard
        items={items}
        totals={totals}
        actorUserId={actor.userId}
        canAssign={canAssign}
        assignableUsers={assignable}
        now={now.toISOString()}
      />
    </div>
  );
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
