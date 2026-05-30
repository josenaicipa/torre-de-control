"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_COLORS,
} from "../../_lib/tokens";
import {
  BUCKET_COLORS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  type DueBucket,
  formatLongDateEs,
  formatRelativeDateEs,
  groupByBucket,
} from "../../_lib/follow-ups";
import { FollowUpDrawer, type DrawerPatch } from "./FollowUpDrawer";

type Status = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export interface AssignableUser {
  id: string;
  label: string;
}

export interface FollowUpRow {
  id: string;
  reason: string;
  priority: string;
  status: Status;
  suggestedAction: string | null;
  notes: string | null;
  result: string | null;
  dueDate: string | null;
  contactedAt: string | null;
  nextActionAt: string | null;
  assignedToId: string | null;
  assignedName: string | null;
  member: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
  };
}

interface Props {
  items: FollowUpRow[];
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  // ISO string for the request's "now". Passing it from the server keeps the
  // bucket math and relative-date rendering deterministic between SSR and
  // hydration, avoiding the flash users would otherwise see if we used
  // Date.now() in the client.
  now: string;
}

interface RowSaveState {
  saving: boolean;
  error: string | null;
  savedAt: number | null;
}

const COLUMN_COUNT = 9;

export function FollowUpsTable({
  items,
  actorUserId,
  canAssign,
  assignableUsers,
  now,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, RowSaveState>>(
    {},
  );
  const [, startTransition] = useTransition();

  // Local view of each follow-up so optimistic edits show up immediately
  // without waiting for a full page refresh. We refresh the route after a
  // successful save so server-side counters (open / urgent) stay in sync.
  const [rows, setRows] = useState<Record<string, FollowUpRow>>(() => {
    const map: Record<string, FollowUpRow> = {};
    for (const it of items) map[it.id] = it;
    return map;
  });

  const nowDate = useMemo(() => new Date(now), [now]);

  const assignableById = useMemo(() => {
    const map = new Map<string, AssignableUser>();
    for (const u of assignableUsers) map.set(u.id, u);
    return map;
  }, [assignableUsers]);

  async function patchFollowUp(
    id: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: boolean; data?: Partial<FollowUpRow>; error?: string }> {
    setSaveStates((s) => ({
      ...s,
      [id]: { saving: true, error: null, savedAt: s[id]?.savedAt ?? null },
    }));
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
          [id]: {
            saving: false,
            error: payload.error ?? "No se pudo guardar.",
            savedAt: s[id]?.savedAt ?? null,
          },
        }));
        return { ok: false, error: payload.error };
      }
      setSaveStates((s) => ({
        ...s,
        [id]: { saving: false, error: null, savedAt: Date.now() },
      }));
      return { ok: true, data: payload.data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de red";
      setSaveStates((s) => ({
        ...s,
        [id]: { saving: false, error: msg, savedAt: s[id]?.savedAt ?? null },
      }));
      return { ok: false, error: msg };
    }
  }

  async function handleStatusChange(id: string, status: Status) {
    const prev = rows[id];
    setRows((r) => ({ ...r, [id]: { ...r[id], status } }));
    const result = await patchFollowUp(id, { status });
    if (!result.ok) {
      setRows((r) => ({ ...r, [id]: prev }));
      return;
    }
    startTransition(() => router.refresh());
  }

  async function handleAssignChange(id: string, assignedToId: string | null) {
    const prev = rows[id];
    const nextLabel = assignedToId
      ? assignableById.get(assignedToId)?.label ?? prev.assignedName
      : null;
    setRows((r) => ({
      ...r,
      [id]: { ...r[id], assignedToId, assignedName: nextLabel ?? null },
    }));
    const result = await patchFollowUp(id, { assignedToId });
    if (!result.ok) {
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

  const list = items.map((it) => rows[it.id] ?? it);

  // Group while preserving the server's incoming row order within each
  // bucket. The server orders by (dueDate asc nulls last, priority asc), so
  // OVERDUE will already arrive oldest-first and TODAY ordered by priority.
  const grouped = useMemo(() => groupByBucket(list, nowDate), [list, nowDate]);

  const selectedRow = selectedId ? rows[selectedId] ?? null : null;
  const selectedSave = selectedId ? saveStates[selectedId] : undefined;

  if (list.length === 0) {
    return (
      <div
        style={{
          backgroundColor: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          color: COLORS.textMuted,
        }}
      >
        No hay seguimientos para este filtro.
      </div>
    );
  }

  return (
    <>
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
                <Th>Prioridad</Th>
                <Th>Miembro</Th>
                <Th>País</Th>
                <Th>Motivo</Th>
                <Th>Acción sugerida</Th>
                <Th>Estado</Th>
                <Th>Vence</Th>
                <Th>Responsable</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            {BUCKET_ORDER.map((bucket) => {
              const bucketRows = grouped[bucket];
              if (bucketRows.length === 0) return null;
              return (
                <BucketSection
                  key={bucket}
                  bucket={bucket}
                  rows={bucketRows}
                  now={nowDate}
                  saveStates={saveStates}
                  selectedId={selectedId}
                  onOpenDetail={(id) => setSelectedId(id)}
                  onStatus={handleStatusChange}
                  onAssign={handleAssignChange}
                  actorUserId={actorUserId}
                  canAssign={canAssign}
                  assignableUsers={assignableUsers}
                />
              );
            })}
          </table>
        </div>
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
          savedAt={selectedSave?.savedAt ?? null}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => handleDrawerSave(selectedRow.id, patch)}
        />
      )}
    </>
  );
}

function BucketSection({
  bucket,
  rows,
  now,
  saveStates,
  selectedId,
  onOpenDetail,
  onStatus,
  onAssign,
  actorUserId,
  canAssign,
  assignableUsers,
}: {
  bucket: DueBucket;
  rows: FollowUpRow[];
  now: Date;
  saveStates: Record<string, RowSaveState>;
  selectedId: string | null;
  onOpenDetail: (id: string) => void;
  onStatus: (id: string, status: Status) => void;
  onAssign: (id: string, assignedToId: string | null) => void;
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const palette = BUCKET_COLORS[bucket];
  return (
    <tbody>
      <tr>
        <td
          colSpan={COLUMN_COUNT}
          style={{
            backgroundColor: palette.bg,
            color: palette.text,
            borderTop: `1px solid ${COLORS.border}`,
            borderBottom: `1px solid ${palette.border}`,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: palette.border,
              marginRight: 8,
              verticalAlign: "middle",
            }}
          />
          {BUCKET_LABELS[bucket]} · {rows.length}
        </td>
      </tr>
      {rows.map((row) => {
        const save = saveStates[row.id];
        return (
          <RowFragment
            key={row.id}
            row={row}
            now={now}
            bucket={bucket}
            isSelected={selectedId === row.id}
            save={save}
            onOpenDetail={() => onOpenDetail(row.id)}
            onStatus={(s) => onStatus(row.id, s)}
            onAssign={(assignedToId) => onAssign(row.id, assignedToId)}
            actorUserId={actorUserId}
            canAssign={canAssign}
            assignableUsers={assignableUsers}
          />
        );
      })}
    </tbody>
  );
}

function RowFragment({
  row,
  now,
  bucket,
  isSelected,
  save,
  onOpenDetail,
  onStatus,
  onAssign,
  actorUserId,
  canAssign,
  assignableUsers,
}: {
  row: FollowUpRow;
  now: Date;
  bucket: DueBucket;
  isSelected: boolean;
  save: RowSaveState | undefined;
  onOpenDetail: () => void;
  onStatus: (s: Status) => void;
  onAssign: (assignedToId: string | null) => void;
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const memberName =
    row.member.fullName ?? row.member.email ?? row.member.phone ?? "—";
  const palette = BUCKET_COLORS[bucket];
  const isMine = row.assignedToId === actorUserId;

  // The whole row is clickable to open the drawer, but the cells containing
  // interactive controls (links, selects, buttons) stop propagation so the
  // drawer doesn't fire when the user is changing status / assignee inline.
  return (
    <>
      <tr
        onClick={onOpenDetail}
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          boxShadow: `inset 3px 0 0 ${palette.rowAccent}`,
          cursor: "pointer",
          backgroundColor: isSelected ? COLORS.background : undefined,
        }}
      >
        <Td>
          <PriorityBadge priority={row.priority} />
        </Td>
        <Td>
          <Link
            href={`/comunidad-dropi/miembros/${row.member.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              color: COLORS.text,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {memberName}
          </Link>
        </Td>
        <Td>{row.member.country ?? "—"}</Td>
        <Td>{FOLLOW_UP_REASON_LABELS[row.reason] ?? row.reason}</Td>
        <Td>
          <span style={{ color: COLORS.textSoft }}>
            {row.suggestedAction ?? "—"}
          </span>
        </Td>
        <Td onClick={(e) => e.stopPropagation()}>
          <select
            value={row.status}
            onChange={(e) => onStatus(e.target.value as Status)}
            style={statusSelectStyle(row.status)}
            disabled={save?.saving}
            aria-label="Cambiar estado"
          >
            {(["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"] as Status[]).map(
              (s) => (
                <option key={s} value={s}>
                  {FOLLOW_UP_STATUS_LABELS[s]}
                </option>
              ),
            )}
          </select>
        </Td>
        <Td>
          <DueCell value={row.dueDate} now={now} bucket={bucket} />
        </Td>
        <Td onClick={(e) => e.stopPropagation()}>
          <AssigneeCell
            row={row}
            save={save}
            canAssign={canAssign}
            isMine={isMine}
            assignableUsers={assignableUsers}
            actorUserId={actorUserId}
            onAssign={onAssign}
          />
        </Td>
        <Td onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onOpenDetail}
            style={ghostButtonStyle()}
            aria-label={`Ver detalle del seguimiento de ${memberName}`}
          >
            Ver detalle
          </button>
        </Td>
      </tr>
      {save?.error && (
        <tr>
          <td colSpan={COLUMN_COUNT} style={{ padding: "4px 14px" }}>
            <span style={{ color: COLORS.danger, fontSize: 12 }}>
              {save.error}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}

function DueCell({
  value,
  now,
  bucket,
}: {
  value: string | null;
  now: Date;
  bucket: DueBucket;
}) {
  if (!value) {
    return <span style={{ color: COLORS.textMuted }}>Sin fecha</span>;
  }
  const palette = BUCKET_COLORS[bucket];
  const long = formatLongDateEs(value);
  const relative = formatRelativeDateEs(value, now);
  return (
    <span title={long} style={{ display: "inline-flex", flexDirection: "column" }}>
      <span style={{ color: palette.text, fontWeight: 700, fontSize: 12 }}>
        {relative}
      </span>
      <span style={{ color: COLORS.textSoft, fontSize: 11 }}>{long}</span>
    </span>
  );
}

function AssigneeCell({
  row,
  save,
  canAssign,
  isMine,
  assignableUsers,
  actorUserId,
  onAssign,
}: {
  row: FollowUpRow;
  save: RowSaveState | undefined;
  canAssign: boolean;
  isMine: boolean;
  assignableUsers: AssignableUser[];
  actorUserId: string;
  onAssign: (assignedToId: string | null) => void;
}) {
  if (!canAssign) {
    return (
      <span style={{ color: row.assignedName ? COLORS.text : COLORS.textMuted }}>
        {row.assignedName ?? "Sin asignar"}
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select
        value={row.assignedToId ?? ""}
        onChange={(e) => onAssign(e.target.value ? e.target.value : null)}
        disabled={save?.saving}
        aria-label="Asignar responsable"
        style={{
          ...inputStyle(),
          padding: "4px 6px",
          fontSize: 12,
          fontWeight: 600,
          minWidth: 140,
        }}
      >
        <option value="">Sin asignar</option>
        {assignableUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
      {!isMine && (
        <button
          type="button"
          onClick={() => onAssign(actorUserId)}
          disabled={save?.saving}
          style={assignMeButtonStyle(Boolean(save?.saving))}
          aria-label="Asignarme este seguimiento"
        >
          Asignarme
        </button>
      )}
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

function Td({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td
      onClick={onClick}
      style={{ padding: "8px 12px", verticalAlign: "middle" }}
    >
      {children}
    </td>
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

function statusSelectStyle(status: Status): React.CSSProperties {
  const palette: Record<Status, { bg: string; text: string }> = {
    OPEN: { bg: "#FEF3C7", text: "#92400E" },
    IN_PROGRESS: { bg: "#E0F2FE", text: "#075985" },
    DONE: { bg: "#DCFCE7", text: "#166534" },
    DISMISSED: { bg: "#F1F5F9", text: "#475569" },
  };
  const c = palette[status];
  return {
    padding: "4px 8px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: c.bg,
    color: c.text,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}

function ghostButtonStyle(): React.CSSProperties {
  return {
    padding: "5px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    cursor: "pointer",
  };
}

function assignMeButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "3px 8px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: disabled ? COLORS.border : COLORS.background,
    color: disabled ? COLORS.textMuted : COLORS.text,
    cursor: disabled ? "not-allowed" : "pointer",
    alignSelf: "flex-start",
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
    fontWeight: 500,
    textTransform: "none",
    letterSpacing: "normal",
  };
}
