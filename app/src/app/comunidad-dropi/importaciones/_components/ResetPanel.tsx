"use client";

import { useState } from "react";
import { COLORS } from "../../_lib/tokens";
import {
  RESET_CONFIRM_PHRASE,
  RESET_TABLE_ORDER,
  isConfirmPhraseValid,
  type BackupSummary,
  type ResetCounts,
  type ResetTableName,
} from "@/lib/comunidad-dropi-reset";

interface ResetResult {
  dryRun: boolean;
  countsBefore: ResetCounts;
  countsAfter: ResetCounts;
  affectedTables: ResetTableName[];
  backupSummary: BackupSummary;
}

const TABLE_LABELS: Record<ResetTableName, string> = {
  DropiStudentLinkAudit: "Auditoría de vínculos",
  DropiFollowUp: "Seguimientos",
  DropiWeeklyMetric: "Métricas semanales",
  DropiMonthlyMetric: "Métricas mensuales",
  DropiImportBatch: "Lotes de importación",
  DropiCommunityMember: "Miembros de la comunidad",
};

function totalRows(counts: ResetCounts): number {
  return RESET_TABLE_ORDER.reduce((sum, table) => sum + (counts[table] ?? 0), 0);
}

export function ResetPanel() {
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState<"dry" | "wipe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);

  const phraseOk = isConfirmPhraseValid(phrase.trim());
  const canWipe = phraseOk && acknowledged && loading === null;

  async function runReset(dryRun: boolean) {
    setError(null);
    setLoading(dryRun ? "dry" : "wipe");
    try {
      const body: Record<string, unknown> = { dryRun, backup: true };
      if (!dryRun) body.confirmPhrase = phrase.trim();

      const res = await fetch("/api/comunidad-dropi/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(payload.error ?? "No se pudo ejecutar la operación.");
        return;
      }
      setError(null);
      setResult(payload.data as ResetResult);
      if (!dryRun) {
        setPhrase("");
        setAcknowledged(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  }

  async function handleWipe() {
    if (!canWipe) return;
    const confirmed = window.confirm(
      "Esta acción borra de forma DEFINITIVA todos los datos de Comunidad Dropi " +
        "(miembros, métricas, seguimientos, importaciones y auditoría). " +
        "Se generará un respaldo previo. ¿Continuar?",
    );
    if (!confirmed) return;
    await runReset(false);
  }

  return (
    <section
      style={{
        marginTop: 22,
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.danger}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: COLORS.danger,
        }}
      >
        Zona peligrosa · Reiniciar datos de Comunidad Dropi
      </h2>
      <p
        style={{
          margin: "6px 0 14px",
          color: COLORS.textSoft,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Borra por completo miembros, métricas semanales y mensuales,
        seguimientos, lotes de importación y la auditoría de vínculos. La
        operación es irreversible: ejecuta primero una simulación para revisar
        cuántos registros se eliminarían. Antes de borrar se genera un respaldo
        en el servidor.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => runReset(true)}
          disabled={loading !== null}
          style={secondaryButton(loading !== null)}
        >
          {loading === "dry"
            ? "Ejecutando simulación…"
            : "Ejecutar simulación (dry-run)"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
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

      {result && <ResultView result={result} />}

      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: `1px dashed ${COLORS.border}`,
        }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: COLORS.danger,
          }}
        >
          Limpieza destructiva
        </h3>
        <label style={labelStyle()}>
          Escribe exactamente la frase de confirmación
          <input
            type="text"
            value={phrase}
            onChange={(e) => {
              setPhrase(e.target.value);
              setError(null);
            }}
            placeholder={RESET_CONFIRM_PHRASE}
            autoComplete="off"
            spellCheck={false}
            style={inputStyle(phraseOk)}
          />
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 10,
            fontSize: 13,
            color: COLORS.text,
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              setAcknowledged(e.target.checked);
              setError(null);
            }}
          />
          Entiendo que esta acción es irreversible.
        </label>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={handleWipe}
            disabled={!canWipe}
            style={dangerButton(!canWipe)}
          >
            {loading === "wipe"
              ? "Borrando…"
              : "Borrar definitivamente Comunidad Dropi"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ResultView({ result }: { result: ResetResult }) {
  const { dryRun, countsBefore, countsAfter, backupSummary } = result;
  return (
    <div
      style={{
        marginTop: 14,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          backgroundColor: dryRun ? COLORS.background : "#DCFCE7",
          borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 12,
          fontWeight: 700,
          color: dryRun ? COLORS.textSoft : "#166534",
        }}
      >
        {dryRun
          ? `Simulación: se eliminarían ${totalRows(countsBefore)} registros.`
          : `Limpieza ejecutada: se eliminaron ${
              totalRows(countsBefore) - totalRows(countsAfter)
            } registros.`}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead style={{ backgroundColor: COLORS.surface }}>
          <tr>
            <Th>Tabla</Th>
            <Th align="right">Antes</Th>
            <Th align="right">Después</Th>
          </tr>
        </thead>
        <tbody>
          {RESET_TABLE_ORDER.map((table) => (
            <tr key={table} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <Td>{TABLE_LABELS[table]}</Td>
              <Td align="right">{countsBefore[table] ?? 0}</Td>
              <Td align="right">{countsAfter[table] ?? 0}</Td>
            </tr>
          ))}
          <tr
            style={{
              borderTop: `2px solid ${COLORS.border}`,
              fontWeight: 700,
            }}
          >
            <Td>Total</Td>
            <Td align="right">{totalRows(countsBefore)}</Td>
            <Td align="right">{totalRows(countsAfter)}</Td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          padding: "10px 14px",
          borderTop: `1px solid ${COLORS.border}`,
          fontSize: 12,
          color: COLORS.textSoft,
        }}
      >
        <strong style={{ color: COLORS.text }}>Respaldo:</strong>{" "}
        {backupSummary.performed
          ? `generado (${backupSummary.totalRows} registros guardados).`
          : dryRun
          ? "no se genera en simulación."
          : "no se generó."}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "6px 12px",
        textAlign: align,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
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
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return <td style={{ padding: "6px 12px", textAlign: align }}>{children}</td>;
}

function labelStyle(): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.textSoft,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

function inputStyle(ok: boolean): React.CSSProperties {
  return {
    marginTop: 4,
    padding: "8px 10px",
    border: `1px solid ${ok ? COLORS.success : COLORS.border}`,
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
