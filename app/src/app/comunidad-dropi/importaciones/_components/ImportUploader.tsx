"use client";

import { useRef, useState } from "react";
import { COLORS } from "../../_lib/tokens";

interface PreviewRow {
  rowNumber: number;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  dropiExternalId: string | null;
  ordersEntered: number;
  ordersMoved: number;
  ordersDelivered: number;
  ordersReturned: number;
  movementRate: number;
  deliveryRate: number;
  returnRate: number;
}

interface PreviewError {
  rowNumber: number;
  message: string;
}

interface PreviewResponse {
  batchId: string;
  fileHash: string;
  reportType: "WEEKLY" | "MONTHLY";
  periodStart: string | null;
  periodEnd: string | null;
  year: number | null;
  month: number | null;
  rowsTotal: number;
  rowsValid: number;
  rowsFailed: number;
  detectedColumns: Record<string, string>;
  parsedRows: PreviewRow[];
  errors: PreviewError[];
  sheetName: string | null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

// Client-side import flow:
// 1. Operator picks a CSV or XLSX file.
// 2. CSV is read as text; XLSX is read as ArrayBuffer and sent base64-encoded.
// 3. We send the raw content + manual overrides to /preview.
// 4. The API returns a PreviewResponse the operator reviews.
// 5. On confirm we POST the *same* content to /confirm, so the server
//    re-validates everything against the original hash and writes the
//    members/metrics/follow-ups in one transaction.
export function ImportUploader() {
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [csvContent, setCsvContent] = useState<string>("");
  const [xlsxBase64, setXlsxBase64] = useState<string>("");
  const [reportType, setReportType] = useState<"AUTO" | "WEEKLY" | "MONTHLY">(
    "AUTO",
  );
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function changeReportType(next: "AUTO" | "WEEKLY" | "MONTHLY") {
    setReportType(next);
    // Clear fields that don't apply to the new type so the stale state from a
    // previous attempt can't leak into the next preview body. We also drop the
    // current preview because its reportType no longer matches the form, and
    // confirming a stale preview is exactly the bug we want to avoid.
    if (next === "MONTHLY") {
      setPeriodStart("");
      setPeriodEnd("");
    } else if (next === "WEEKLY") {
      setYear("");
      setMonth("");
    }
    setPreview(null);
    setError(null);
  }

  async function ingestFile(file: File) {
    setError(null);
    setPreview(null);
    setSuccessMessage(null);
    const isCsv = /\.csv$/i.test(file.name);
    const isXlsx = /\.xlsx$/i.test(file.name);
    if (!isCsv && !isXlsx) {
      setError("Formato no soportado. Usa un archivo .csv o .xlsx.");
      return;
    }
    setFileName(file.name);
    setFileSize(file.size);
    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      setXlsxBase64(arrayBufferToBase64(buffer));
      setCsvContent("");
    } else {
      const text = await file.text();
      setCsvContent(text);
      setXlsxBase64("");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
  }

  function clearFile() {
    setFileName("");
    setFileSize(0);
    setCsvContent("");
    setXlsxBase64("");
    setError(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await ingestFile(file);
  }

  async function handlePreview() {
    setError(null);
    setSuccessMessage(null);
    if (!fileName || (!csvContent && !xlsxBase64)) {
      setError("Selecciona un archivo CSV o XLSX antes de continuar.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { fileName };
      if (xlsxBase64) body.xlsxBase64 = xlsxBase64;
      else body.csvContent = csvContent;
      if (reportType !== "AUTO") body.reportType = reportType;
      if (periodStart) body.periodStart = periodStart;
      if (periodEnd) body.periodEnd = periodEnd;
      if (year) body.year = Number(year);
      if (month) body.month = Number(month);
      if (country) body.country = country;

      const res = await fetch("/api/comunidad-dropi/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "No se pudo generar la vista previa.");
      } else {
        setPreview(payload.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      const confirmBody: Record<string, unknown> = xlsxBase64
        ? { xlsxBase64 }
        : { csvContent };
      const res = await fetch(
        `/api/comunidad-dropi/imports/${preview.batchId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(confirmBody),
        },
      );
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "No se pudo confirmar la importación.");
      } else {
        setSuccessMessage(
          `Importación confirmada: ${payload.data.rowsProcessed} filas procesadas, ${payload.data.followUpsOpened} seguimientos abiertos.`,
        );
        setPreview(null);
        setFileName("");
        setFileSize(0);
        setCsvContent("");
        setXlsxBase64("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section
      style={{
        position: "relative",
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: COLORS.text,
        }}
      >
        Subir reporte CSV o XLSX
      </h2>
      <p
        style={{
          margin: "6px 0 14px",
          color: COLORS.textSoft,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Acepta CSV con separador coma o archivos XLSX exportados de Dropi, con
        encabezados en español (nombre, correo, teléfono, país, órdenes
        ingresadas/movilizadas/entregadas/devueltas). El sistema intentará
        detectar el periodo desde el nombre del archivo y la hoja correcta del
        XLSX.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFileChange}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="Seleccionar archivo CSV o XLSX"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "22px 16px",
          borderRadius: 12,
          border: `2px dashed ${
            isDragging ? COLORS.brand : fileName ? COLORS.brand : COLORS.border
          }`,
          backgroundColor: isDragging
            ? "#FFF1EC"
            : fileName
            ? "#FFF8F6"
            : COLORS.background,
          cursor: "pointer",
          textAlign: "center",
          transition:
            "background-color 120ms ease, border-color 120ms ease",
          outline: "none",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.text,
          }}
        >
          {fileName
            ? "Archivo listo para previsualizar"
            : "Arrastra o selecciona el archivo CSV o XLSX"}
        </div>
        <div
          style={{
            fontSize: 12,
            color: COLORS.textSoft,
          }}
        >
          {fileName ? (
            <>
              <strong style={{ color: COLORS.text }}>{fileName}</strong>
              {fileSize > 0 && (
                <span style={{ marginLeft: 6 }}>
                  · {formatFileSize(fileSize)}
                </span>
              )}
            </>
          ) : (
            "Formatos aceptados: .csv y .xlsx"
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <span
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              backgroundColor: COLORS.brand,
              color: COLORS.surface,
            }}
          >
            {fileName ? "Elegir otro archivo" : "Seleccionar archivo"}
          </span>
          {fileName && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                backgroundColor: COLORS.surface,
                color: COLORS.textSoft,
                border: `1px solid ${COLORS.border}`,
                cursor: "pointer",
              }}
            >
              Quitar
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <label style={labelStyle()}>
          Tipo de reporte
          <select
            value={reportType}
            onChange={(e) =>
              changeReportType(e.target.value as "AUTO" | "WEEKLY" | "MONTHLY")
            }
            style={inputStyle()}
          >
            <option value="AUTO">Detectar automáticamente</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensual</option>
          </select>
        </label>
        <label style={labelStyle()}>
          País (opcional)
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="CO, MX, EC…"
            style={inputStyle()}
          />
        </label>
      </div>

      {reportType !== "MONTHLY" && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <label style={labelStyle()}>
            Inicio semana
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              style={inputStyle()}
            />
          </label>
          <label style={labelStyle()}>
            Fin semana
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              style={inputStyle()}
            />
          </label>
        </div>
      )}

      {reportType !== "WEEKLY" && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          <label style={labelStyle()}>
            Año
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2026"
              style={inputStyle()}
            />
          </label>
          <label style={labelStyle()}>
            Mes
            <input
              type="number"
              min="1"
              max="12"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="1-12"
              style={inputStyle()}
            />
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading || !fileName}
          style={primaryButton(loading || !fileName)}
        >
          {loading ? "Generando vista previa…" : "Generar vista previa"}
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

      {successMessage && (
        <div
          style={{
            marginTop: 12,
            backgroundColor: "#DCFCE7",
            color: "#166534",
            padding: 10,
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {successMessage}
        </div>
      )}

      {preview && (
        <div
          style={{
            marginTop: 18,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: COLORS.background,
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              fontSize: 12,
              color: COLORS.textSoft,
            }}
          >
            <span>
              <strong style={{ color: COLORS.text }}>{preview.rowsValid}</strong>{" "}
              filas válidas
            </span>
            <span>
              <strong style={{ color: COLORS.danger }}>{preview.rowsFailed}</strong>{" "}
              con error
            </span>
            <span>Tipo: {preview.reportType === "WEEKLY" ? "Semanal" : "Mensual"}</span>
            {preview.sheetName && (
              <span>
                Hoja detectada:{" "}
                <strong style={{ color: COLORS.text }}>
                  {preview.sheetName}
                </strong>
              </span>
            )}
            {preview.periodStart && preview.periodEnd && (
              <span>
                Periodo: {preview.periodStart.slice(0, 10)} →{" "}
                {preview.periodEnd.slice(0, 10)}
              </span>
            )}
            {preview.year && preview.month && (
              <span>
                Periodo: {preview.year}-{String(preview.month).padStart(2, "0")}
              </span>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
            >
              <thead style={{ backgroundColor: COLORS.surface }}>
                <tr>
                  <Th>#</Th>
                  <Th>Nombre</Th>
                  <Th>Correo</Th>
                  <Th>Teléfono</Th>
                  <Th>País</Th>
                  <Th>Ing</Th>
                  <Th>Mov</Th>
                  <Th>Ent</Th>
                  <Th>Dev</Th>
                </tr>
              </thead>
              <tbody>
                {preview.parsedRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    style={{ borderTop: `1px solid ${COLORS.border}` }}
                  >
                    <Td>{row.rowNumber}</Td>
                    <Td>{row.fullName ?? "—"}</Td>
                    <Td>{row.email ?? "—"}</Td>
                    <Td>{row.phone ?? "—"}</Td>
                    <Td>{row.country ?? "—"}</Td>
                    <Td>{row.ordersEntered}</Td>
                    <Td>{row.ordersMoved}</Td>
                    <Td>{row.ordersDelivered}</Td>
                    <Td>{row.ordersReturned}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.errors.length > 0 && (
            <div
              style={{
                padding: "10px 14px",
                borderTop: `1px solid ${COLORS.border}`,
                fontSize: 12,
                color: COLORS.danger,
              }}
            >
              <strong>Errores ({preview.errors.length}):</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {preview.errors.slice(0, 10).map((err) => (
                  <li key={err.rowNumber}>
                    Fila {err.rowNumber}: {err.message}
                  </li>
                ))}
                {preview.errors.length > 10 && (
                  <li>… y {preview.errors.length - 10} más.</li>
                )}
              </ul>
            </div>
          )}
          <div
            style={{
              padding: "12px 14px",
              borderTop: `1px solid ${COLORS.border}`,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || preview.rowsValid === 0}
              style={primaryButton(confirming || preview.rowsValid === 0)}
            >
              {confirming
                ? "Confirmando…"
                : `Confirmar ${preview.rowsValid} filas`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "6px 10px",
        textAlign: "left",
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

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "6px 10px" }}>{children}</td>;
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

function inputStyle(): React.CSSProperties {
  return {
    marginTop: 4,
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

function primaryButton(disabled: boolean): React.CSSProperties {
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
