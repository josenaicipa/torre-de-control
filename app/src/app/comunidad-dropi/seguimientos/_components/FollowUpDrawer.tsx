"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORS,
  CONTACT_CHANNEL_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  FOLLOW_UP_REASON_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  PRIORITY_LABELS,
} from "../../_lib/tokens";
import {
  buildCallHref,
  buildWhatsAppHref,
  formatLongDateEs,
  formatRelativeDateEs,
  formatSnoozeShortEs,
} from "../../_lib/follow-ups";
import type { AssignableUser, FollowUpRow } from "./FollowUpsTable";

type Status = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

export interface DrawerPatch {
  status: Status;
  priority: string;
  assignedToId: string | null;
  dueDate: string | null;
  contactedAt: string | null;
  nextActionAt: string | null;
  snoozedUntil: string | null;
  outcome: string | null;
  contactChannel: string | null;
  notes: string | null;
  result: string | null;
}

interface Props {
  row: FollowUpRow;
  now: Date;
  canAssign: boolean;
  assignableUsers: AssignableUser[];
  actorUserId: string;
  saving: boolean;
  error: string | null;
  savedAt: number | null;
  onClose: () => void;
  onSave: (patch: DrawerPatch) => Promise<{ ok: boolean }>;
}

export function FollowUpDrawer({
  row,
  now,
  canAssign,
  assignableUsers,
  actorUserId,
  saving,
  error,
  savedAt,
  onClose,
  onSave,
}: Props) {
  const [status, setStatus] = useState<Status>(row.status);
  const [priority, setPriority] = useState<string>(row.priority);
  const [assignedToId, setAssignedToId] = useState<string | null>(
    row.assignedToId,
  );
  const [dueDate, setDueDate] = useState(toDateInput(row.dueDate));
  const [contactedAt, setContactedAt] = useState(toDateInput(row.contactedAt));
  const [nextActionAt, setNextActionAt] = useState(
    toDateInput(row.nextActionAt),
  );
  const [snoozedUntil, setSnoozedUntil] = useState(
    toDateInput(row.snoozedUntil),
  );
  const [outcome, setOutcome] = useState<string>(row.outcome ?? "");
  const [contactChannel, setContactChannel] = useState<string>(
    row.contactChannel ?? "",
  );
  const [notes, setNotes] = useState(row.notes ?? "");
  const [result, setResult] = useState(row.result ?? "");

  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Esc to dismiss + initial focus on the close button. Focus on the close
  // control instead of an input so keyboard users land at a non-destructive
  // affordance and can tab forward into the form naturally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const memberName =
    row.member.fullName ?? row.member.email ?? row.member.phone ?? "—";

  const waHref = useMemo(
    () => buildWhatsAppHref(row.member.phone),
    [row.member.phone],
  );
  const callHref = useMemo(
    () => buildCallHref(row.member.phone),
    [row.member.phone],
  );

  const reasonLabel = FOLLOW_UP_REASON_LABELS[row.reason] ?? row.reason;

  async function handleSubmit() {
    await onSave({
      status,
      priority,
      assignedToId,
      dueDate: dueDate ? dueDate : null,
      contactedAt: contactedAt ? contactedAt : null,
      nextActionAt: nextActionAt ? nextActionAt : null,
      snoozedUntil: snoozedUntil ? snoozedUntil : null,
      outcome: outcome ? outcome : null,
      contactChannel: contactChannel ? contactChannel : null,
      notes: notes.trim() ? notes.trim() : null,
      result: result.trim() ? result.trim() : null,
    });
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(17,17,16,0.32)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle del seguimiento de ${memberName}`}
        onClick={(e) => e.stopPropagation()}
        style={drawerPanelStyle()}
      >
        <header style={headerStyle()}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: COLORS.textSoft,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {reasonLabel}
            </div>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: 18,
                fontWeight: 800,
                color: COLORS.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {memberName}
            </h2>
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                color: COLORS.textSoft,
              }}
            >
              {row.member.country ?? "Sin país"}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            style={closeButtonStyle()}
          >
            Cerrar
          </button>
        </header>

        <div style={bodyStyle()}>
          <Section title="Contacto">
            <div style={{ display: "grid", gap: 6 }}>
              <ContactLine label="Email" value={row.member.email} />
              <ContactLine label="Teléfono" value={row.member.phone} />
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
              }}
            >
              {waHref ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={actionButtonStyle({ tone: "success" })}
                >
                  WhatsApp
                </a>
              ) : null}
              {callHref ? (
                <a
                  href={callHref}
                  style={actionButtonStyle({ tone: "neutral" })}
                >
                  Llamar
                </a>
              ) : null}
              <Link
                href={`/comunidad-dropi/miembros/${row.member.id}`}
                style={actionButtonStyle({ tone: "brand" })}
              >
                Abrir ficha
              </Link>
            </div>
            {!waHref && !callHref && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 12,
                  color: COLORS.textMuted,
                }}
              >
                Sin teléfono utilizable para WhatsApp o llamada.
              </p>
            )}
          </Section>

          <Section title="Trabajo">
            <div style={gridTwo()}>
              <Field label="Estado">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  style={inputStyle()}
                  disabled={saving}
                  aria-label="Cambiar estado"
                >
                  {(
                    ["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"] as Status[]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {FOLLOW_UP_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                  aria-label="Cambiar prioridad"
                >
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="Responsable">
                {canAssign ? (
                  <select
                    value={assignedToId ?? ""}
                    onChange={(e) =>
                      setAssignedToId(e.target.value ? e.target.value : null)
                    }
                    style={inputStyle()}
                    disabled={saving}
                    aria-label="Asignar responsable"
                  >
                    <option value="">Sin asignar</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    style={{
                      fontSize: 13,
                      color: row.assignedName ? COLORS.text : COLORS.textMuted,
                    }}
                  >
                    {row.assignedName ?? "Sin asignar"}
                  </span>
                )}
              </Field>
              {canAssign && assignedToId !== actorUserId && (
                <button
                  type="button"
                  onClick={() => setAssignedToId(actorUserId)}
                  disabled={saving}
                  style={ghostButtonStyle()}
                >
                  Asignarme
                </button>
              )}
            </div>
            {row.suggestedAction && (
              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: 13,
                  color: COLORS.textSoft,
                  backgroundColor: COLORS.background,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <strong style={{ color: COLORS.text }}>
                  Acción sugerida:
                </strong>{" "}
                {row.suggestedAction}
              </p>
            )}
          </Section>

          <Section title="Fechas">
            <div style={gridThree()}>
              <Field
                label={`Vence${dueDate ? ` · ${formatRelativeDateEs(dueDate, now)}` : ""}`}
              >
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                />
              </Field>
              <Field label="Último contacto">
                <input
                  type="date"
                  value={contactedAt}
                  onChange={(e) => setContactedAt(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                />
              </Field>
              <Field label="Próxima acción">
                <input
                  type="date"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                />
              </Field>
            </div>
            <div style={{ marginTop: 10 }}>
              <Field
                label={`Posponer hasta${
                  snoozedUntil
                    ? ` · ${formatSnoozeShortEs(snoozedUntil, now) ?? formatRelativeDateEs(snoozedUntil, now)}`
                    : ""
                }`}
              >
                <input
                  type="date"
                  value={snoozedUntil}
                  onChange={(e) => setSnoozedUntil(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                  aria-label="Posponer hasta"
                />
              </Field>
              {snoozedUntil && (
                <button
                  type="button"
                  onClick={() => setSnoozedUntil("")}
                  disabled={saving}
                  style={ghostButtonStyle()}
                  aria-label="Quitar posponer"
                >
                  Quitar posponer
                </button>
              )}
            </div>
          </Section>

          <Section title="Contacto registrado">
            <div style={gridTwo()}>
              <Field label="Resultado del contacto">
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                  aria-label="Resultado del contacto"
                >
                  <option value="">Sin registrar</option>
                  {Object.entries(FOLLOW_UP_OUTCOME_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Canal usado">
                <select
                  value={contactChannel}
                  onChange={(e) => setContactChannel(e.target.value)}
                  style={inputStyle()}
                  disabled={saving}
                  aria-label="Canal de contacto"
                >
                  <option value="">Sin registrar</option>
                  {Object.entries(CONTACT_CHANNEL_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            </div>
          </Section>

          <Section title="Notas y resultado">
            <Field label="Notas">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Lo que sabemos del miembro, intentos, contexto…"
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  minHeight: 84,
                }}
                disabled={saving}
              />
            </Field>
            <Field label="Resultado">
              <textarea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Qué pasó al contactar (respondió, no contesta, agendó…)."
                style={{
                  ...inputStyle(),
                  resize: "vertical",
                  minHeight: 64,
                }}
                disabled={saving}
              />
            </Field>
          </Section>
        </div>

        <footer style={footerStyle()}>
          <div
            aria-live="polite"
            style={{ fontSize: 12, minHeight: 18, flex: "1 1 auto" }}
          >
            {saving && (
              <span style={{ color: COLORS.textSoft }}>Guardando…</span>
            )}
            {!saving && error && (
              <span style={{ color: COLORS.danger }}>{error}</span>
            )}
            {!saving && !error && savedAt && (
              <span style={{ color: COLORS.success }}>Guardado</span>
            )}
            {row.contactedAt && !saving && !error && !savedAt && (
              <span style={{ color: COLORS.textMuted }}>
                Último contacto: {formatLongDateEs(row.contactedAt)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={ghostButtonStyle()}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={primaryButtonStyle(saving)}
          >
            Guardar cambios
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          fontWeight: 800,
          color: COLORS.textSoft,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        color: COLORS.textSoft,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
      {children}
    </label>
  );
}

function ContactLine({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        fontSize: 13,
        color: COLORS.text,
        alignItems: "baseline",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.textSoft,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          minWidth: 70,
        }}
      >
        {label}
      </span>
      <span style={{ color: value ? COLORS.text : COLORS.textMuted }}>
        {value && value.trim() ? value : "—"}
      </span>
    </div>
  );
}

function toDateInput(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

function drawerPanelStyle(): React.CSSProperties {
  return {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    width: "min(480px, 100vw)",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "-10px 0 24px rgba(17,17,16,0.12)",
    borderLeft: `1px solid ${COLORS.border}`,
  };
}

function headerStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 18px",
    borderBottom: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.background,
  };
}

function bodyStyle(): React.CSSProperties {
  return {
    padding: "16px 18px",
    overflowY: "auto",
    flex: "1 1 auto",
  };
}

function footerStyle(): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 18px",
    borderTop: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.background,
  };
}

function gridTwo(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  };
}

function gridThree(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
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

function ghostButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 12px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    cursor: "pointer",
    textDecoration: "none",
    alignSelf: "flex-start",
    marginTop: 6,
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: disabled ? COLORS.border : COLORS.brand,
    color: disabled ? COLORS.textMuted : COLORS.surface,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function closeButtonStyle(): React.CSSProperties {
  return {
    padding: "6px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function actionButtonStyle({
  tone,
}: {
  tone: "brand" | "success" | "neutral";
}): React.CSSProperties {
  const palette: Record<
    "brand" | "success" | "neutral",
    { bg: string; color: string; border: string }
  > = {
    brand: { bg: COLORS.brand, color: COLORS.surface, border: COLORS.brand },
    success: { bg: "#15803D", color: COLORS.surface, border: "#15803D" },
    neutral: { bg: COLORS.surface, color: COLORS.text, border: COLORS.border },
  };
  const c = palette[tone];
  return {
    padding: "8px 12px",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: c.bg,
    color: c.color,
    textDecoration: "none",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
