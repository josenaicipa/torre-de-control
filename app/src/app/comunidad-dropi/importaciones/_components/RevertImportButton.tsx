"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLORS } from "../../_lib/tokens";

interface RevertImpact {
  weeklyMetrics: number;
  monthlyMetrics: number;
  affectedMembers: number;
  membersDeleted: number;
  followUpsLinked: number;
  followUpsDeleted: number;
  followUpsPreserved: number;
}

interface PreviewResponse {
  requiresAdmin: boolean;
  impact: RevertImpact;
}

export function RevertImportButton({
  batchId,
  fileName,
  status,
}: {
  batchId: string;
  fileName: string;
  status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<RevertImpact | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const isRevert = status === "COMPLETED";
  const actionLabel = isRevert ? "Revertir" : "Eliminar";
  const actionLabelLower = isRevert ? "revertir" : "eliminar";

  function resetModalState() {
    setError(null);
    setImpact(null);
    setConfirmInput("");
    setAcknowledged(false);
  }

  async function openModal() {
    setOpen(true);
    resetModalState();
    setLoading(true);
    try {
      const res = await fetch(`/api/comunidad-dropi/imports/${batchId}`);
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "No se pudo cargar el detalle.");
        return;
      }
      setImpact((payload.data as PreviewResponse).impact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setOpen(false);
    resetModalState();
  }

  const canConfirm =
    !loading &&
    !reverting &&
    impact !== null &&
    confirmInput === batchId &&
    acknowledged;

  async function confirmRevert() {
    if (!canConfirm) return;
    setReverting(true);
    setError(null);
    try {
      const res = await fetch(`/api/comunidad-dropi/imports/${batchId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmBatchId: batchId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? `No se pudo ${actionLabelLower} la importación.`);
        return;
      }
      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setReverting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openModal} style={linkButton()}>
        {actionLabel}
      </button>

      {open && (
        <div style={overlay()} onClick={() => !reverting && closeModal()}>
          <div style={modal()} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              {actionLabel} importación
            </h3>
            <p
              style={{
                margin: "6px 0 14px",
                fontSize: 13,
                color: COLORS.textSoft,
                lineHeight: 1.5,
              }}
            >
              Vas a {actionLabelLower}{" "}
              <strong style={{ color: COLORS.text }}>{fileName}</strong>. Se
              generará un respaldo en el servidor antes de borrar. Esta acción no
              se puede deshacer desde la interfaz.
            </p>

            {loading && (
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                Calculando impacto…
              </div>
            )}

            {impact && (
              <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                <li>
                  Se eliminarán{" "}
                  <strong>{impact.weeklyMetrics}</strong> métricas semanales y{" "}
                  <strong>{impact.monthlyMetrics}</strong> mensuales.
                </li>
                <li>
                  <strong>{impact.affectedMembers}</strong> miembros afectados;{" "}
                  <strong>{impact.membersDeleted}</strong> quedarán vacíos y se
                  eliminarán.
                </li>
                <li>
                  <strong>{impact.followUpsDeleted}</strong> seguimientos
                  automáticos se eliminarán;{" "}
                  <strong>{impact.followUpsPreserved}</strong> con trabajo se
                  conservan (se desvinculan del origen).
                </li>
              </ul>
            )}

            {impact && (
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    fontWeight: 700,
                    color: COLORS.textSoft,
                    marginBottom: 6,
                  }}
                >
                  Para confirmar, copia el identificador del lote:
                </label>
                <code
                  style={{
                    display: "block",
                    backgroundColor: COLORS.background,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 12,
                    color: COLORS.text,
                    wordBreak: "break-all",
                    marginBottom: 8,
                    userSelect: "all",
                  }}
                  title={batchId}
                >
                  {batchId}
                </code>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  disabled={reverting}
                  placeholder="Pega aquí el identificador del lote"
                  spellCheck={false}
                  autoComplete="off"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "9px 10px",
                    borderRadius: 8,
                    fontSize: 13,
                    border: `1px solid ${
                      confirmInput.length === 0
                        ? COLORS.border
                        : confirmInput === batchId
                        ? "#16A34A"
                        : COLORS.danger
                    }`,
                    color: COLORS.text,
                    backgroundColor: COLORS.surface,
                  }}
                />
                {confirmInput.length > 0 && confirmInput !== batchId && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: COLORS.danger,
                      fontWeight: 600,
                    }}
                  >
                    El identificador no coincide.
                  </div>
                )}
              </div>
            )}

            {impact && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 14,
                  fontSize: 13,
                  color: COLORS.text,
                  lineHeight: 1.4,
                  cursor: reverting ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  disabled={reverting}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Entiendo que esta acción modifica datos de Comunidad Dropi
                </span>
              </label>
            )}

            {error && (
              <div
                style={{
                  marginBottom: 12,
                  backgroundColor: "#FEE2E2",
                  color: "#991B1B",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeModal}
                disabled={reverting}
                style={secondaryButton(reverting)}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRevert}
                disabled={!canConfirm}
                style={dangerButton(!canConfirm)}
              >
                {reverting
                  ? isRevert
                    ? "Revirtiendo…"
                    : "Eliminando…"
                  : `${actionLabel} definitivamente`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function linkButton(): React.CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: 0,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "underline",
  };
}

function overlay(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(15,23,42,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  };
}

function modal(): React.CSSProperties {
  return {
    backgroundColor: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: 20,
    maxWidth: 460,
    width: "100%",
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
    color: COLORS.text,
  };
}

function secondaryButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: COLORS.surface,
    color: disabled ? COLORS.textMuted : COLORS.text,
    border: `1px solid ${COLORS.border}`,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function dangerButton(disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 16px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: disabled ? COLORS.border : COLORS.danger,
    color: disabled ? COLORS.textMuted : COLORS.surface,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
