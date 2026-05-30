"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  COLORS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
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
import {
  diffSelectionForGroup,
  isEverySelected,
  isSomeSelected,
  summarizeBulkOutcome,
  toggleSelection,
  type BulkFailure,
  type BulkOutcome,
  type BulkOutcomeSummary,
} from "../../_lib/bulk";
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

interface BulkBarState {
  saving: boolean;
  summary: BulkOutcomeSummary | null;
}

const COLUMN_COUNT = 10;

export function FollowUpsTable({
  items,
  actorUserId,
  canAssign,
  assignableUsers,
  now,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkState, setBulkState] = useState<BulkBarState>({
    saving: false,
    summary: null,
  });
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

  const visibleIds = useMemo(() => list.map((r) => r.id), [list]);

  // Drop selections whose rows are no longer in the visible result set (e.g.
  // after a router.refresh removed completed items). Keeps the bulk bar honest
  // about which ids will actually receive the patch.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(visibleIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIds]);

  const selectedRow = selectedId ? rows[selectedId] ?? null : null;
  const selectedSave = selectedId ? saveStates[selectedId] : undefined;

  function toggleRow(id: string) {
    setSelectedIds((s) => toggleSelection(s, id));
    setBulkState((s) => ({ ...s, summary: null }));
  }

  function toggleGroup(ids: string[]) {
    setSelectedIds((s) => diffSelectionForGroup(s, ids));
    setBulkState((s) => ({ ...s, summary: null }));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkState({ saving: false, summary: null });
  }

  async function applyBulkPatch(
    patch: Record<string, unknown>,
    nextRowPatch: Partial<FollowUpRow>,
  ): Promise<void> {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const prev: Record<string, FollowUpRow> = {};
    setBulkState({ saving: true, summary: null });
    setRows((r) => {
      const next = { ...r };
      for (const id of ids) {
        if (next[id]) {
          prev[id] = next[id];
          next[id] = { ...next[id], ...nextRowPatch };
        }
      }
      return next;
    });
    try {
      const res = await fetch("/api/comunidad-dropi/follow-ups/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      });
      const payload = await res.json();
      if (!res.ok) {
        // Revert optimistic edits for everyone in the batch.
        setRows((r) => ({ ...r, ...prev }));
        setBulkState({
          saving: false,
          summary: {
            tone: "error",
            message: payload?.error ?? "No se pudo aplicar el lote.",
          },
        });
        return;
      }
      const outcome: BulkOutcome = {
        requested: payload.data.requested,
        updated: payload.data.updated,
        failed: payload.data.failed,
        failures: (payload.data.failures ?? []) as BulkFailure[],
      };
      // Revert the failed rows so the table reflects reality.
      if (outcome.failures.length > 0) {
        setRows((r) => {
          const next = { ...r };
          for (const f of outcome.failures) {
            if (prev[f.id]) next[f.id] = prev[f.id];
          }
          return next;
        });
        // Drop failed ids from the selection so a retry doesn't keep hitting
        // them. Keep the survivors so the operator can compose another patch.
        setSelectedIds((s) => {
          const next = new Set(s);
          for (const f of outcome.failures) next.delete(f.id);
          return next;
        });
      } else {
        setSelectedIds(new Set());
      }
      setBulkState({
        saving: false,
        summary: summarizeBulkOutcome(outcome),
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setRows((r) => ({ ...r, ...prev }));
      const msg = err instanceof Error ? err.message : "Error de red";
      setBulkState({
        saving: false,
        summary: { tone: "error", message: msg },
      });
    }
  }

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

  const everyVisibleSelected = isEverySelected(selectedIds, visibleIds);
  const someVisibleSelected = isSomeSelected(selectedIds, visibleIds);

  return (
    <>
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          state={bulkState}
          canAssign={canAssign}
          actorUserId={actorUserId}
          assignableUsers={assignableUsers}
          onAssign={(assignedToId) =>
            applyBulkPatch(
              { assignedToId },
              {
                assignedToId,
                assignedName: assignedToId
                  ? assignableById.get(assignedToId)?.label ?? null
                  : null,
              },
            )
          }
          onPriority={(priority) =>
            applyBulkPatch({ priority }, { priority })
          }
          onStatus={(status) => applyBulkPatch({ status }, { status })}
          onClear={clearSelection}
        />
      )}
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
                <Th>
                  <MasterCheckbox
                    checked={everyVisibleSelected}
                    indeterminate={!everyVisibleSelected && someVisibleSelected}
                    disabled={bulkState.saving}
                    onChange={() => toggleGroup(visibleIds)}
                    ariaLabel="Seleccionar todos los seguimientos visibles"
                  />
                </Th>
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
              const bucketIds = bucketRows.map((r) => r.id);
              return (
                <BucketSection
                  key={bucket}
                  bucket={bucket}
                  rows={bucketRows}
                  bucketIds={bucketIds}
                  now={nowDate}
                  saveStates={saveStates}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  bulkSaving={bulkState.saving}
                  onToggleRow={toggleRow}
                  onToggleGroup={toggleGroup}
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

function BulkActionBar({
  count,
  state,
  canAssign,
  actorUserId,
  assignableUsers,
  onAssign,
  onPriority,
  onStatus,
  onClear,
}: {
  count: number;
  state: BulkBarState;
  canAssign: boolean;
  actorUserId: string;
  assignableUsers: AssignableUser[];
  onAssign: (assignedToId: string | null) => void;
  onPriority: (priority: string) => void;
  onStatus: (status: Status) => void;
  onClear: () => void;
}) {
  const summaryColor =
    state.summary?.tone === "success"
      ? COLORS.success
      : state.summary?.tone === "error"
        ? COLORS.danger
        : COLORS.warning;

  return (
    <div
      role="region"
      aria-label="Acciones masivas"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        marginBottom: 10,
        padding: "10px 14px",
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        boxShadow: "0 6px 16px rgba(17,17,16,0.06)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-live="polite"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.text,
          marginRight: 4,
        }}
      >
        {count === 1
          ? "1 seguimiento seleccionado"
          : `${count} seguimientos seleccionados`}
      </span>

      {canAssign && (
        <label style={bulkControlLabel()}>
          <span>Responsable</span>
          <select
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return;
              if (v === "__me__") onAssign(actorUserId);
              else if (v === "__none__") onAssign(null);
              else onAssign(v);
              e.target.value = "";
            }}
            disabled={state.saving}
            aria-label="Asignar responsable en masa"
            style={bulkSelectStyle()}
          >
            <option value="" disabled>
              Asignar…
            </option>
            <option value="__me__">Asignarme a mí</option>
            <option value="__none__">Quitar responsable</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label style={bulkControlLabel()}>
        <span>Prioridad</span>
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onPriority(v);
            e.target.value = "";
          }}
          disabled={state.saving}
          aria-label="Cambiar prioridad en masa"
          style={bulkSelectStyle()}
        >
          <option value="" disabled>
            Cambiar a…
          </option>
          {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => onStatus("DONE")}
        disabled={state.saving}
        style={bulkButtonStyle("success", state.saving)}
        aria-label="Marcar seleccionados como Hecho"
      >
        Marcar Hecho
      </button>

      <button
        type="button"
        onClick={() => onStatus("DISMISSED")}
        disabled={state.saving}
        style={bulkButtonStyle("neutral", state.saving)}
        aria-label="Marcar seleccionados como Descartado"
      >
        Descartar
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={state.saving}
        style={bulkButtonStyle("ghost", state.saving)}
        aria-label="Limpiar selección"
      >
        Limpiar
      </button>

      <span
        aria-live="polite"
        style={{
          marginLeft: "auto",
          fontSize: 12,
          fontWeight: 600,
          minHeight: 16,
          color: state.saving ? COLORS.textSoft : summaryColor,
        }}
      >
        {state.saving
          ? "Aplicando…"
          : state.summary
            ? state.summary.message
            : ""}
      </span>
    </div>
  );
}

function MasterCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
    />
  );
}

function BucketSection({
  bucket,
  rows,
  bucketIds,
  now,
  saveStates,
  selectedId,
  selectedIds,
  bulkSaving,
  onToggleRow,
  onToggleGroup,
  onOpenDetail,
  onStatus,
  onAssign,
  actorUserId,
  canAssign,
  assignableUsers,
}: {
  bucket: DueBucket;
  rows: FollowUpRow[];
  bucketIds: string[];
  now: Date;
  saveStates: Record<string, RowSaveState>;
  selectedId: string | null;
  selectedIds: Set<string>;
  bulkSaving: boolean;
  onToggleRow: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onOpenDetail: (id: string) => void;
  onStatus: (id: string, status: Status) => void;
  onAssign: (id: string, assignedToId: string | null) => void;
  actorUserId: string;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
}) {
  const palette = BUCKET_COLORS[bucket];
  const bucketChecked = isEverySelected(selectedIds, bucketIds);
  const bucketIndeterminate =
    !bucketChecked && isSomeSelected(selectedIds, bucketIds);
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <MasterCheckbox
              checked={bucketChecked}
              indeterminate={bucketIndeterminate}
              disabled={bulkSaving}
              onChange={() => onToggleGroup(bucketIds)}
              ariaLabel={`Seleccionar todos los seguimientos de ${BUCKET_LABELS[bucket]}`}
            />
            <span
              style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: palette.border,
              }}
            />
            <span>
              {BUCKET_LABELS[bucket]} · {rows.length}
            </span>
          </span>
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
            isChecked={selectedIds.has(row.id)}
            bulkSaving={bulkSaving}
            save={save}
            onToggleRow={() => onToggleRow(row.id)}
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
  isChecked,
  bulkSaving,
  save,
  onToggleRow,
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
  isChecked: boolean;
  bulkSaving: boolean;
  save: RowSaveState | undefined;
  onToggleRow: () => void;
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
  // interactive controls (checkbox, links, selects, buttons) stop propagation
  // so the drawer doesn't fire when the user is changing status / assignee
  // inline or toggling the selection checkbox.
  return (
    <>
      <tr
        onClick={onOpenDetail}
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          boxShadow: `inset 3px 0 0 ${palette.rowAccent}`,
          cursor: "pointer",
          backgroundColor: isChecked
            ? "#FFFBEB"
            : isSelected
              ? COLORS.background
              : undefined,
        }}
      >
        <Td onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isChecked}
            disabled={bulkSaving}
            onChange={onToggleRow}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Seleccionar seguimiento de ${memberName}`}
            style={{ cursor: bulkSaving ? "not-allowed" : "pointer" }}
          />
        </Td>
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

function bulkControlLabel(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.textSoft,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

function bulkSelectStyle(): React.CSSProperties {
  return {
    padding: "6px 8px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontFamily: "inherit",
    cursor: "pointer",
  };
}

function bulkButtonStyle(
  tone: "success" | "neutral" | "ghost",
  disabled: boolean,
): React.CSSProperties {
  const palette: Record<
    "success" | "neutral" | "ghost",
    { bg: string; color: string; border: string }
  > = {
    success: {
      bg: COLORS.success,
      color: COLORS.surface,
      border: COLORS.success,
    },
    neutral: {
      bg: COLORS.surface,
      color: COLORS.text,
      border: COLORS.border,
    },
    ghost: {
      bg: "transparent",
      color: COLORS.textSoft,
      border: "transparent",
    },
  };
  const c = palette[tone];
  return {
    padding: "7px 12px",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: c.bg,
    color: c.color,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
