import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import {
  COLORS,
  CONTACT_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_LABELS,
} from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import {
  logFollowUpContactAction,
  updateFollowUpStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TABS: Array<{
  key: "OPEN_AND_PROGRESS" | "DONE" | "DISMISSED";
  label: string;
}> = [
  { key: "OPEN_AND_PROGRESS", label: "Pendientes y en seguimiento" },
  { key: "DONE", label: "Resueltas" },
  { key: "DISMISSED", label: "Descartadas" },
];

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parseTab(value: string | undefined): (typeof STATUS_TABS)[number]["key"] {
  if (value === "DONE" || value === "DISMISSED") return value;
  return "OPEN_AND_PROGRESS";
}

export default async function AccionesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const tab = parseTab(sp.tab);
  const canAct = actor.role === "ADMIN" || actor.role === "OPERATOR";

  const where: Record<string, unknown> =
    tab === "OPEN_AND_PROGRESS"
      ? { status: { in: ["OPEN", "IN_PROGRESS"] } }
      : { status: tab };

  const [items, counts] = await Promise.all([
    prisma.dropiFollowUp.findMany({
      where,
      orderBy: [
        { priority: "asc" },
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 100,
      include: {
        member: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            country: true,
          },
        },
      },
    }),
    prisma.dropiFollowUp.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = new Map<string, number>();
  for (const c of counts) countByStatus.set(c.status, c._count._all);
  const openAndProgressCount =
    (countByStatus.get("OPEN") ?? 0) + (countByStatus.get("IN_PROGRESS") ?? 0);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 14,
        }}
      >
        {STATUS_TABS.map((t) => {
          const count =
            t.key === "OPEN_AND_PROGRESS"
              ? openAndProgressCount
              : countByStatus.get(t.key) ?? 0;
          return (
            <Link
              key={t.key}
              href={
                t.key === "OPEN_AND_PROGRESS"
                  ? "/comunidad-dropi/acciones"
                  : `/comunidad-dropi/acciones?tab=${t.key}`
              }
              style={tabStyle(t.key === tab)}
            >
              {t.label} · {count}
            </Link>
          );
        })}
      </div>

      {!canAct ? (
        <Banner text="Tu rol no permite cambiar el estado de las acciones; solo puedes consultarlas." />
      ) : null}

      {items.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((f) => (
            <FollowUpRow key={f.id} item={f} canAct={canAct} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Acciones</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Acciones del radar
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Cola simple de seguimientos generados por el radar. Cambia el estado,
        registra el contacto y deja una nota corta del resultado.
      </p>
    </header>
  );
}

type FollowUpItem = {
  id: string;
  reason: string;
  priority: string;
  status: string;
  suggestedAction: string | null;
  notes: string | null;
  result: string | null;
  outcome: string | null;
  contactChannel: string | null;
  dueDate: Date | null;
  contactedAt: Date | null;
  member: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
  };
};

function FollowUpRow({ item, canAct }: { item: FollowUpItem; canAct: boolean }) {
  return (
    <li
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Link
            href={`/comunidad-dropi/miembros/${item.member.id}`}
            style={{
              color: COLORS.brand,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: "none",
            }}
          >
            {item.member.fullName ?? item.member.email ?? "Sin nombre"}
          </Link>
          <span
            style={{ color: COLORS.textSoft, fontSize: 12, fontWeight: 500 }}
          >
            {item.member.country ?? "—"}
            {item.member.email ? ` · ${item.member.email}` : ""}
            {item.member.phone ? ` · ${item.member.phone}` : ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            alignItems: "center",
          }}
        >
          <PriorityChip priority={item.priority} />
          <StatusChip status={item.status} />
          <ReasonChip reason={item.reason} />
        </div>
      </div>

      {item.suggestedAction ? (
        <p style={{ margin: "0 0 6px", color: COLORS.text, fontSize: 13 }}>
          <strong>Sugerido:</strong> {item.suggestedAction}
        </p>
      ) : null}

      <p
        style={{ margin: "0 0 10px", color: COLORS.textSoft, fontSize: 12 }}
      >
        {item.dueDate ? (
          <>Vence: {formatDate(item.dueDate)} · </>
        ) : null}
        {item.contactedAt ? (
          <>Último contacto: {formatDate(item.contactedAt)}</>
        ) : (
          "Sin contacto registrado todavía"
        )}
        {item.outcome ? (
          <>
            {" · "}Resultado:{" "}
            <strong>
              {FOLLOW_UP_OUTCOME_LABELS[item.outcome] ?? item.outcome}
            </strong>
          </>
        ) : null}
        {item.contactChannel ? (
          <>
            {" · "}Canal:{" "}
            <strong>
              {CONTACT_CHANNEL_LABELS[item.contactChannel] ??
                item.contactChannel}
            </strong>
          </>
        ) : null}
      </p>

      {item.result ? (
        <p
          style={{
            margin: "0 0 10px",
            padding: "8px 10px",
            backgroundColor: COLORS.background,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            color: COLORS.textSoft,
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {item.result}
        </p>
      ) : null}

      {canAct ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <StatusActions id={item.id} currentStatus={item.status} />
          <ContactForm id={item.id} status={item.status} />
        </div>
      ) : null}
    </li>
  );
}

function StatusActions({
  id,
  currentStatus,
}: {
  id: string;
  currentStatus: string;
}) {
  const targets: Array<{ label: string; status: string }> = [
    { label: "Marcar pendiente", status: "OPEN" },
    { label: "En seguimiento", status: "IN_PROGRESS" },
    { label: "Resuelta", status: "DONE" },
    { label: "Descartar", status: "DISMISSED" },
  ];
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {targets.map((t) => (
        <form
          key={t.status}
          action={updateFollowUpStatusAction}
          style={{ display: "inline-flex" }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={t.status} />
          <button
            type="submit"
            disabled={t.status === currentStatus}
            style={
              t.status === currentStatus
                ? activeStatusButtonStyle()
                : statusButtonStyle(t.status)
            }
          >
            {t.label}
          </button>
        </form>
      ))}
    </div>
  );
}

function ContactForm({ id, status }: { id: string; status: string }) {
  return (
    <form
      action={logFollowUpContactAction}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        padding: "8px 10px",
        backgroundColor: COLORS.background,
        borderRadius: 8,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="contactChannel"
        defaultValue=""
        style={inputStyle()}
        aria-label="Canal de contacto"
      >
        <option value="">Canal…</option>
        {Object.entries(CONTACT_CHANNEL_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <select
        name="outcome"
        defaultValue=""
        style={inputStyle()}
        aria-label="Resultado del contacto"
      >
        <option value="">Resultado…</option>
        {Object.entries(FOLLOW_UP_OUTCOME_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="notes"
        placeholder="Nota corta (opcional)"
        maxLength={2000}
        style={{ ...inputStyle(), flex: "1 1 200px", minWidth: 160 }}
      />
      {status === "OPEN" ? (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: COLORS.textSoft,
          }}
        >
          <input type="checkbox" name="advance" value="1" defaultChecked />
          Mover a “En seguimiento”
        </label>
      ) : null}
      <button type="submit" style={primaryButtonStyle()}>
        Registrar contacto
      </button>
    </form>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 14px",
        backgroundColor: "#FEF3C7",
        border: "1px solid #FCD34D",
        borderRadius: 10,
        color: "#92400E",
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function EmptyState({
  tab,
}: {
  tab: "OPEN_AND_PROGRESS" | "DONE" | "DISMISSED";
}) {
  const text =
    tab === "OPEN_AND_PROGRESS"
      ? "No hay acciones pendientes. El radar las creará al detectar caídas, devoluciones altas o miembros nuevos."
      : tab === "DONE"
        ? "Todavía no hay acciones marcadas como resueltas."
        : "No hay acciones descartadas.";
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
        Sin acciones por ahora
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        {text}
      </p>
    </section>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    P1: { bg: "#FEE2E2", text: "#991B1B" },
    P2: { bg: "#FEF3C7", text: "#92400E" },
    P3: { bg: "#F1F5F9", text: "#475569" },
    P4: { bg: "#FAE8FF", text: "#86198F" },
  };
  const c = map[priority] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <span style={chipStyle(c)} title={PRIORITY_LABELS[priority] ?? priority}>
      {priority}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    OPEN: { bg: "#FEF3C7", text: "#92400E" },
    IN_PROGRESS: { bg: "#E0F2FE", text: "#075985" },
    DONE: { bg: "#DCFCE7", text: "#166534" },
    DISMISSED: { bg: "#F1F5F9", text: "#475569" },
  };
  const c = colorMap[status] ?? { bg: "#F1F5F9", text: "#475569" };
  return (
    <span style={chipStyle(c)}>
      {FOLLOW_UP_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ReasonChip({ reason }: { reason: string }) {
  return (
    <span style={chipStyle({ bg: "#F1F5F9", text: "#475569" })}>
      {FOLLOW_UP_REASON_LABELS[reason] ?? reason}
    </span>
  );
}

function chipStyle(c: { bg: string; text: string }): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "2px 8px",
    borderRadius: 999,
    backgroundColor: c.bg,
    color: c.text,
    fontSize: 11,
    fontWeight: 700,
  };
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    textDecoration: "none",
    color: active ? COLORS.surface : COLORS.textSoft,
    backgroundColor: active ? COLORS.brand : COLORS.surface,
    border: `1px solid ${active ? COLORS.brand : COLORS.border}`,
  };
}

function statusButtonStyle(target: string): React.CSSProperties {
  const tint: Record<string, string> = {
    OPEN: "#92400E",
    IN_PROGRESS: "#075985",
    DONE: "#166534",
    DISMISSED: "#475569",
  };
  return {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.surface,
    color: tint[target] ?? COLORS.textSoft,
    cursor: "pointer",
  };
}

function activeStatusButtonStyle(): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.background,
    color: COLORS.textMuted,
    cursor: "not-allowed",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "6px 8px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    fontSize: 12,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontFamily: "inherit",
  };
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    padding: "6px 12px",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    cursor: "pointer",
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

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
