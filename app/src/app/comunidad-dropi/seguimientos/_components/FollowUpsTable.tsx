"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_COLORS,
} from "../../_lib/tokens";

type Status = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

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
}

interface RowSaveState {
  saving: boolean;
  error: string | null;
  savedAt: number | null;
}

export function FollowUpsTable({ items }: Props) {
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ backgroundColor: COLORS.background }}>
            <tr>
              <Th>Prioridad</Th>
              <Th>Miembro</Th>
              <Th>País</Th>
              <Th>Motivo</Th>
              <Th>Acción sugerida</Th>
              <Th>Estado</Th>
              <Th>Vence</Th>
              <Th>Detalle</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => {
              const save = saveStates[f.id];
              const isOpen = expanded === f.id;
              return (
                <RowFragment
                  key={f.id}
                  row={f}
                  isOpen={isOpen}
                  save={save}
                  onToggle={() => setExpanded(isOpen ? null : f.id)}
                  onStatus={(s) => handleStatusChange(f.id, s)}
                  onSaveDetail={(patch) => handleSaveDetail(f.id, patch)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowFragment({
  row,
  isOpen,
  save,
  onToggle,
  onStatus,
  onSaveDetail,
}: {
  row: FollowUpRow;
  isOpen: boolean;
  save: RowSaveState | undefined;
  onToggle: () => void;
  onStatus: (s: Status) => void;
  onSaveDetail: (patch: {
    notes: string;
    result: string;
    contactedAt: string;
    nextActionAt: string;
    dueDate: string;
  }) => void;
}) {
  const memberName =
    row.member.fullName ?? row.member.email ?? row.member.phone ?? "—";

  return (
    <>
      <tr style={{ borderTop: `1px solid ${COLORS.border}` }}>
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
        <Td>{formatDate(row.dueDate)}</Td>
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
          <td colSpan={8} style={{ padding: 14 }}>
            <DetailEditor row={row} save={save} onSave={onSaveDetail} />
          </td>
        </tr>
      )}
      {save?.error && !isOpen && (
        <tr>
          <td colSpan={8} style={{ padding: "4px 14px" }}>
            <span style={{ color: COLORS.danger, fontSize: 12 }}>
              {save.error}
            </span>
          </td>
        </tr>
      )}
    </>
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

function formatDate(d: string | null): string {
  if (!d) return "—";
  return d.slice(0, 10);
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
