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
  const [expanded, setExpanded] = useState<string | null>(null);
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

  async function handleSaveDetail(
    id: string,
    patch: {
      notes: string;
      result: string;
      contactedAt: string;
      nextActionAt: string;
      dueDate: string;
    },
  ) {
    const body: Record<string, unknown> = {
      notes: patch.notes.trim() ? patch.notes.trim() : null,
      result: patch.result.trim() ? patch.result.trim() : null,
      contactedAt: patch.contactedAt ? patch.contactedAt : null,
      nextActionAt: patch.nextActionAt ? patch.nextActionAt : null,
      dueDate: patch.dueDate ? patch.dueDate : null,
    };
    const result = await patchFollowUp(id, body);
    if (!result.ok) return;
    setRows((r) => ({
      ...r,
      [id]: {
        ...r[id],
        notes: body.notes as string | null,
        result: body.result as string | null,
        contactedAt: body.contactedAt as string | null,
        nextActionAt: body.nextActionAt as string | null,
        dueDate: body.dueDate as string | null,
      },
    }));
    startTransition(() => router.refresh());
  }

  const list = items.map((it) => rows[it.id] ?? it);

  // Group while preserving the server's incoming row order within each
  // bucket. The server orders by (dueDate asc nulls last, priority asc), so
  // OVERDUE will already arrive oldest-first and TODAY ordered by priority.
  const grouped = useMemo(() => groupByBucket(list, nowDate), [list, nowDate]);

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
                expanded={expanded}
                onToggle={(id) =>
                  setExpanded((current) => (current === id ? null : id))
                }
                onStatus={handleStatusChange}
                onAssign={handleAssignChange}
                onSaveDetail={handleSaveDetail}
                actorUserId={actorUserId}
                canAssign={canAssign}
                assignableUsers={assignableUsers}
              />
            );
          })}
        </table>
      </div>
    </div>
  );
}

function BucketSection({
  bucket,
  rows,
  now,
  saveStates,
  expanded,
  onToggle,
  onStatus,
  onAssign,
  onSaveDetail,
  actorUserId,
  canAssign,
  assignableUsers,
}: {
  bucket: DueBucket;
  rows: FollowUpRow[];
  now: Date;
  saveStates: Record<string, RowSaveState>;
  expanded: string | null;
  onToggle: (id: string) => void;
  onStatus: (id: string, status: Status) => void;
  onAssign: (id: string, assignedToId: string | null) => void;
  onSaveDetail: (
    id: string,
    patch: {
      notes: string;
      result: string;
      contactedAt: string;
      nextActionAt: string;
      dueDate: string;
    },
  ) => void;
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
        const isOpen = expanded === row.id;
        return (
          <RowFragment
            key={row.id}
            row={row}
            now={now}
            bucket={bucket}
            isOpen={isOpen}
            save={save}
            onToggle={() => onToggle(row.id)}
            onStatus={(s) => onStatus(row.id, s)}
            onAssign={(assignedToId) => onAssign(row.id, assignedToId)}
            onSaveDetail={(patch) => onSaveDetail(row.id, patch)}
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
  isOpen,
  save,
  onToggle,
  onStatus,
  onAssign,
  onSaveDetail,
  actorUserId,
  canAssign,
  assignableUsers,
}: {
  row: FollowUpRow;
  now: Date;
  bucket: DueBucket;
  isOpen: boolean;
  save: RowSaveState | undefined;
  onToggle: () => void;
  onStatus: (s: Status) => void;
  onAssign: (assignedToId: string | null) => void;
  onSaveDetail: (patch: {
    notes: string;
    result: string;
    contactedAt: string;
    nextActionAt: string;
    dueDate: string;
  }) => void;
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const memberName =
    row.member.fullName ?? row.member.email ?? row.member.phone ?? "—";
  const palette = BUCKET_COLORS[bucket];
  const isMine = row.assignedToId === actorUserId;

  return (
    <>
      <tr
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          boxShadow: `inset 3px 0 0 ${palette.rowAccent}`,
        }}
      >
        <Td>
          <PriorityBadge priority={row.priority} />
        </Td>
        <Td>
          <Link
            href={`/comunidad-dropi/miembros/${row.member.id}`}
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
        <Td>
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
        <Td>
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
        <Td>
          <button
            type="button"
            onClick={onToggle}
            style={ghostButtonStyle()}
            aria-expanded={isOpen}
          >
            {isOpen ? "Ocultar" : "Editar"}
          </button>
        </Td>
      </tr>
      {isOpen && (
        <tr style={{ backgroundColor: COLORS.background }}>
          <td colSpan={COLUMN_COUNT} style={{ padding: 14 }}>
            <DetailEditor row={row} save={save} onSave={onSaveDetail} />
          </td>
        </tr>
      )}
      {save?.error && !isOpen && (
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

function DetailEditor({
  row,
  save,
  onSave,
}: {
  row: FollowUpRow;
  save: RowSaveState | undefined;
  onSave: (patch: {
    notes: string;
    result: string;
    contactedAt: string;
    nextActionAt: string;
    dueDate: string;
  }) => void;
}) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const [result, setResult] = useState(row.result ?? "");
  const [contactedAt, setContactedAt] = useState(toDateInput(row.contactedAt));
  const [nextActionAt, setNextActionAt] = useState(
    toDateInput(row.nextActionAt),
  );
  const [dueDate, setDueDate] = useState(toDateInput(row.dueDate));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        <label style={fieldLabelStyle()}>
          Fecha de contacto
          <input
            type="date"
            value={contactedAt}
            onChange={(e) => setContactedAt(e.target.value)}
            style={inputStyle()}
          />
        </label>
        <label style={fieldLabelStyle()}>
          Próxima acción
          <input
            type="date"
            value={nextActionAt}
            onChange={(e) => setNextActionAt(e.target.value)}
            style={inputStyle()}
          />
        </label>
        <label style={fieldLabelStyle()}>
          Vence
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={inputStyle()}
          />
        </label>
      </div>
      <label style={fieldLabelStyle()}>
        Notas
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Lo que sabemos del miembro, intentos, contexto…"
          style={{ ...inputStyle(), resize: "vertical", minHeight: 64 }}
        />
      </label>
      <label style={fieldLabelStyle()}>
        Resultado
        <textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Qué pasó al contactar (respondió, no contesta, agendó…)."
          style={{ ...inputStyle(), resize: "vertical", minHeight: 48 }}
        />
      </label>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {save?.error && (
          <span style={{ color: COLORS.danger, fontSize: 12 }}>
            {save.error}
          </span>
        )}
        {save?.saving && (
          <span style={{ color: COLORS.textSoft, fontSize: 12 }}>
            Guardando…
          </span>
        )}
        {!save?.saving && save?.savedAt && !save.error && (
          <span style={{ color: COLORS.success, fontSize: 12 }}>Guardado</span>
        )}
        <button
          type="button"
          onClick={() =>
            onSave({ notes, result, contactedAt, nextActionAt, dueDate })
          }
          disabled={save?.saving}
          style={primaryButtonStyle(Boolean(save?.saving))}
        >
          Guardar cambios
        </button>
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
  return (
    <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>{children}</td>
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

function toDateInput(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
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

function fieldLabelStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.textSoft,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    gap: 4,
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

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: disabled ? COLORS.border : COLORS.brand,
    color: disabled ? COLORS.textMuted : COLORS.surface,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
