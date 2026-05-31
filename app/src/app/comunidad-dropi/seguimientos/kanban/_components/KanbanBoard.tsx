"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  COLORS,
  CONTACT_CHANNEL_COLORS,
  CONTACT_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_COLORS,
  FOLLOW_UP_OUTCOME_LABELS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_COLORS,
} from "../../../_lib/tokens";
import {
  formatLongDateEs,
  formatRelativeDateEs,
  formatSnoozeShortEs,
  getDueBucket,
  BUCKET_COLORS,
} from "../../../_lib/follow-ups";
import {
  KANBAN_COLUMNS,
  KANBAN_STATUS_ORDER,
  groupByKanbanStatus,
  type KanbanStatus,
} from "../../../_lib/kanban";
import {
  FollowUpDrawer,
  type DrawerPatch,
} from "../../_components/FollowUpDrawer";
import type {
  AssignableUser,
  FollowUpRow,
} from "../../_components/FollowUpsTable";

interface RowSaveState {
  saving: boolean;
  error: string | null;
}

interface Props {
  items: FollowUpRow[];
  // Per-column count *before* the take/limit was applied on the server, so the
  // header can hint "showing N of M" when results were sliced.
  totals: Record<KanbanStatus, number>;
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  // ISO timestamp from the server so SSR and hydration agree on relative
  // dates and bucket math without a client-only `Date.now()` flicker.
  now: string;
}

export function KanbanBoard({
  items,
  totals,
  actorUserId,
  canAssign,
  assignableUsers,
  now,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, FollowUpRow>>(() => {
    const map: Record<string, FollowUpRow> = {};
    for (const it of items) map[it.id] = it;
    return map;
  });
  const [saveStates, setSaveStates] = useState<Record<string, RowSaveState>>(
    {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const nowDate = useMemo(() => new Date(now), [now]);
  const assignableById = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    for (const u of assignableUsers) map.set(u.id, u);
    return map;
  }, [assignableUsers]);

  const list = items.map((it) => rows[it.id] ?? it);
  const grouped = useMemo(() => groupByKanbanStatus(list), [list]);

  async function patchFollowUp(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: Partial<FollowUpRow>; error?: string }> {
    setSaveStates((s) => ({ ...s, [id]: { saving: true, error: null } }));
    try {
      const res = await fetch(`/api/comunidad-dropi/follow-ups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setSaveStates((s) => ({
          ...s,
          [id]: { saving: false, error: payload?.error ?? "No se pudo guardar." },
        }));
        return { ok: false, error: payload?.error };
      }
      setSaveStates((s) => ({ ...s, [id]: { saving: false, error: null } }));
      return { ok: true, data: payload.data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red";
      setSaveStates((s) => ({ ...s, [id]: { saving: false, error: msg } }));
      return { ok: false, error: msg };
    }
  }

  async function handleStatusChange(id: string, status: KanbanStatus) {
    const prev = rows[id];
    if (!prev || prev.status === status) return;
    // Optimistic: move the card across columns immediately so the operator
    // sees the change without waiting for the round-trip.
    setRows((r) => ({ ...r, [id]: { ...r[id], status } }));
    const res = await patchFollowUp(id, { status });
    if (!res.ok) {
      setRows((r) => ({ ...r, [id]: prev }));
      return;
    }
    startTransition(() => router.refresh());
  }

  async function handleDrawerSave(id: string, patch: DrawerPatch) {
    const prev = rows[id];
    const nextLabel = patch.assignedToId
      ? assignableById.get(patch.assignedToId)?.label ?? prev.assignedName
      : null;
    const optimistic: FollowUpRow = {
      ...prev,
      status: patch.status,
      priority: patch.priority,
      assignedToId: patch.assignedToId,
      assignedName: patch.assignedToId ? nextLabel : null,
      dueDate: patch.dueDate,
      contactedAt: patch.contactedAt,
      nextActionAt: patch.nextActionAt,
      snoozedUntil: patch.snoozedUntil,
      outcome: patch.outcome,
      contactChannel: patch.contactChannel,
      notes: patch.notes,
      result: patch.result,
    };
    setRows((r) => ({ ...r, [id]: optimistic }));
    const res = await patchFollowUp(id, { ...patch });
    if (!res.ok) {
      setRows((r) => ({ ...r, [id]: prev }));
      return { ok: false as const };
    }
    startTransition(() => router.refresh());
    return { ok: true as const };
  }

  const selectedRow = selectedId ? rows[selectedId] ?? null : null;
  const selectedSave = selectedId ? saveStates[selectedId] : undefined;

  return (
    <>
      <div
        role="list"
        aria-label="Tablero Kanban de seguimientos"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {KANBAN_COLUMNS.map((col) => {
          const colRows = grouped[col.status];
          const total = totals[col.status] ?? colRows.length;
          const shown = colRows.length;
          return (
            <section
              key={col.status}
              role="listitem"
              aria-label={`Columna ${col.label}`}
              style={{
                backgroundColor: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderTop: `3px solid ${col.accent}`,
                borderRadius: 12,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 200,
              }}
            >
              <header
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  padding: "2px 4px",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: COLORS.text,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {col.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: COLORS.textSoft,
                  }}
                  aria-label={`${shown} de ${total} seguimientos visibles`}
                  title={
                    total > shown
                      ? `Mostrando ${shown} de ${total}. Afina los filtros para ver el resto.`
                      : `${total} seguimientos`
                  }
                >
                  {total > shown ? `${shown}/${total}` : total}
                </span>
              </header>

              {colRows.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: COLORS.textMuted,
                    fontSize: 12,
                    padding: 16,
                    border: `1px dashed ${COLORS.border}`,
                    borderRadius: 8,
                    backgroundColor: COLORS.surface,
                  }}
                >
                  Sin seguimientos
                </div>
              ) : (
                colRows.map((row) => (
                  <Card
                    key={row.id}
                    row={row}
                    now={nowDate}
                    canAssign={canAssign}
                    save={saveStates[row.id]}
                    onOpen={() => setSelectedId(row.id)}
                    onStatus={(s) => handleStatusChange(row.id, s)}
                  />
                ))
              )}
            </section>
          );
        })}
      </div>
      {selectedRow && (
        <FollowUpDrawer
          row={selectedRow}
          now={nowDate}
          canAssign={canAssign}
          assignableUsers={assignableUsers}
          actorUserId={actorUserId}
          saving={Boolean(selectedSave?.saving)}
          error={selectedSave?.error ?? null}
          savedAt={null}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => handleDrawerSave(selectedRow.id, patch)}
        />
      )}
    </>
  );
}

function Card({
  row,
  now,
  canAssign,
  save,
  onOpen,
  onStatus,
}: {
  row: FollowUpRow;
  now: Date;
  canAssign: boolean;
  save: RowSaveState | undefined;
  onOpen: () => void;
  onStatus: (next: KanbanStatus) => void;
}) {
  const memberName =
    row.member.fullName ?? row.member.email ?? row.member.phone ?? "—";
  const bucket = getDueBucket(row.dueDate, now);
  const bucketPalette = BUCKET_COLORS[bucket];
  const snoozeLabel = formatSnoozeShortEs(row.snoozedUntil, now);
  const priorityColor =
    PRIORITY_COLORS[row.priority] ?? { bg: "#F1F5F9", text: "#475569" };

  return (
    <article
      onClick={onOpen}
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${bucketPalette.rowAccent}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        boxShadow: "0 1px 0 rgba(17,17,16,0.03)",
      }}
      aria-label={`Seguimiento de ${memberName}`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{
            backgroundColor: priorityColor.bg,
            color: priorityColor.text,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.02em",
          }}
        >
          {row.priority}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textSoft, fontWeight: 600 }}>
          {row.member.country ?? "—"}
        </span>
      </div>

      <Link
        href={`/comunidad-dropi/miembros/${row.member.id}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          color: COLORS.text,
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
          lineHeight: 1.2,
        }}
      >
        {memberName}
      </Link>

      <div style={{ fontSize: 12, color: COLORS.textSoft }}>
        {FOLLOW_UP_REASON_LABELS[row.reason] ?? row.reason}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
        }}
      >
        {row.outcome && (
          <Chip
            palette={
              FOLLOW_UP_OUTCOME_COLORS[row.outcome] ?? {
                bg: "#F1F5F9",
                text: "#475569",
              }
            }
            title="Resultado del contacto"
          >
            {FOLLOW_UP_OUTCOME_LABELS[row.outcome] ?? row.outcome}
          </Chip>
        )}
        {row.contactChannel && (
          <Chip
            palette={
              CONTACT_CHANNEL_COLORS[row.contactChannel] ?? {
                bg: "#F1F5F9",
                text: "#475569",
              }
            }
            title="Canal de contacto"
          >
            {CONTACT_CHANNEL_LABELS[row.contactChannel] ?? row.contactChannel}
          </Chip>
        )}
        {snoozeLabel && (
          <Chip
            palette={{ bg: "#E0E7FF", text: "#3730A3" }}
            title={
              row.snoozedUntil
                ? `Pospuesto hasta ${formatLongDateEs(row.snoozedUntil)}`
                : ""
            }
          >
            {snoozeLabel}
          </Chip>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 6,
          marginTop: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: bucketPalette.text,
            }}
            title={row.dueDate ? formatLongDateEs(row.dueDate) : "Sin fecha"}
          >
            {row.dueDate
              ? `Vence ${formatRelativeDateEs(row.dueDate, now)}`
              : "Sin fecha"}
          </span>
          <span
            style={{ fontSize: 11, color: COLORS.textSoft, fontWeight: 500 }}
          >
            {row.assignedName ?? "Sin asignar"}
          </span>
        </div>
        {canAssign ? (
          <select
            value={row.status}
            disabled={save?.saving}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value as KanbanStatus)}
            aria-label={`Mover seguimiento de ${memberName} a otra columna`}
            style={{
              padding: "3px 6px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: COLORS.surface,
              color: COLORS.text,
              fontFamily: "inherit",
              cursor: save?.saving ? "not-allowed" : "pointer",
            }}
          >
            {KANBAN_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {FOLLOW_UP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 11, color: COLORS.textSoft, fontWeight: 700 }}>
            {FOLLOW_UP_STATUS_LABELS[row.status]}
          </span>
        )}
      </div>
      {save?.error && (
        <span style={{ color: COLORS.danger, fontSize: 11 }}>{save.error}</span>
      )}
    </article>
  );
}

function Chip({
  palette,
  title,
  children,
}: {
  palette: { bg: string; text: string };
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      style={{
        backgroundColor: palette.bg,
        color: palette.text,
        borderRadius: 999,
        padding: "1px 7px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}
