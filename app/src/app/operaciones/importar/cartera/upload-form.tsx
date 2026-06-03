"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Eye, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";

interface ParsedStudentMember {
  fullName: string;
  email: string | null;
  phone: string | null;
}

interface ParsedInstallment {
  installmentNumber: number;
  amountDue: number;
}

interface ParsedRowPreview {
  legacyRowId: number;
  head: ParsedStudentMember;
  members: ParsedStudentMember[];
  closerNameRaw: string | null;
  durationMonths: number | null;
  durationAssumed: boolean;
  installments: ParsedInstallment[];
  pendingAmount: number;
  status: string;
  warnings: string[];
}

interface PreviewSummary {
  totalRows: number;
  validRows: number;
  rowsWithWarnings: number;
  newStudents: number;
  matchedStudents: number;
  unmatchedClosers: string[];
  sample: ParsedRowPreview[];
  errors: Array<{ row: number; error: string }>;
}

export function CarteraImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRowPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [allRowsOpen, setAllRowsOpen] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setParsedRows([]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/operaciones/import/cartera", {
        method: "POST",
        body: formData,
      });
      const json = (await response.json()) as {
        error?: string;
        preview?: PreviewSummary;
        parsedRows?: ParsedRowPreview[];
      };
      if (!response.ok || !json.preview) {
        setError(json.error ?? "Error al procesar el CSV");
        return;
      }
      setPreview(json.preview);
      setParsedRows(json.parsedRows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Upload size={18} className="text-slate-700" />
          <h2 className="text-lg font-semibold text-slate-900">Paso 1 - Subir CSV</h2>
        </div>
        <div className="space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          {file && (
            <p className="text-xs text-slate-500">
              Archivo: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!file || loading}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Procesando..." : "Generar vista previa (simulación)"}
          </button>
        </div>
      </form>

      {preview && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <Eye size={18} className="text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-900">Paso 2 - Revisar vista previa</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Stat label="Filas totales" value={preview.totalRows} />
            <Stat label="Filas válidas" value={preview.validRows} />
            <Stat label="Estudiantes nuevos" value={preview.newStudents} color="emerald" />
            <Stat label="Ya existen" value={preview.matchedStudents} color="amber" />
            <Stat label="Con avisos" value={preview.rowsWithWarnings} color="amber" />
            <Stat
              label="Errores"
              value={preview.errors.length}
              color={preview.errors.length > 0 ? "rose" : "slate"}
            />
          </div>

          {preview.unmatchedClosers.length > 0 && (
            <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <strong>Closers no encontrados en la base:</strong>{" "}
              {preview.unmatchedClosers.join(", ")}
              <p className="mt-1 text-xs">
                Estas filas quedarían sin closer asignado y requerirían vinculación manual.
              </p>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm">
              <strong className="text-rose-800">Errores ({preview.errors.length}):</strong>
              <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">
                {preview.errors.slice(0, 10).map((entry) => (
                  <li key={`${entry.row}-${entry.error}`}>
                    Fila {entry.row}: {entry.error}
                  </li>
                ))}
                {preview.errors.length > 10 && <li>...y {preview.errors.length - 10} más</li>}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setSampleOpen((prev) => !prev)}
              aria-expanded={sampleOpen}
              aria-controls="cartera-sample-rows"
              className="flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              {sampleOpen ? (
                <ChevronDown size={14} className="shrink-0" />
              ) : (
                <ChevronRight size={14} className="shrink-0" />
              )}
              <span>Ver primeras 5 filas procesadas</span>
            </button>
            {sampleOpen && (
              <div
                id="cartera-sample-rows"
                className="mt-2 max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3"
              >
                {preview.sample.map((row) => (
                  <div
                    key={row.legacyRowId}
                    className="mb-3 border-b border-slate-200 pb-2 text-xs last:mb-0 last:border-0"
                  >
                    <div className="font-bold">
                      {row.head.fullName}
                      {row.members.length > 0 && ` + ${row.members.length} miembros`}
                    </div>
                    <div className="text-slate-600">
                      {row.head.email ?? "(sin email)"} · {row.head.phone ?? "-"}
                    </div>
                    <div className="text-slate-500">
                      Closer: {row.closerNameRaw ?? "-"} · Duración: {row.durationMonths} meses
                      {row.durationAssumed ? " (asumido)" : ""} · Estado: {row.status}
                    </div>
                    <div className="text-slate-500">
                      Cuotas: {row.installments.length} · Pendiente: USD {row.pendingAmount}
                    </div>
                    {row.warnings.length > 0 && (
                      <div className="mt-1 flex items-start gap-1 text-amber-700">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                        {row.warnings.join("; ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setAllRowsOpen((prev) => !prev)}
              aria-expanded={allRowsOpen}
              aria-controls="cartera-all-rows"
              className="flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              {allRowsOpen ? (
                <ChevronDown size={14} className="shrink-0" />
              ) : (
                <ChevronRight size={14} className="shrink-0" />
              )}
              <span>Ver todas las filas procesadas ({parsedRows.length})</span>
            </button>
            {allRowsOpen && (
              <div
                id="cartera-all-rows"
                className="mt-2 max-h-[600px] overflow-auto rounded-md border border-slate-200 bg-slate-50"
              >
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-2 py-1 text-left">Fila</th>
                      <th className="px-2 py-1 text-left">Nombre</th>
                      <th className="px-2 py-1 text-left">Correo</th>
                      <th className="px-2 py-1 text-left">Closer</th>
                      <th className="px-2 py-1 text-left">Meses</th>
                      <th className="px-2 py-1 text-left">Cuotas</th>
                      <th className="px-2 py-1 text-right">Pendiente</th>
                      <th className="px-2 py-1 text-left">Estado</th>
                      <th className="px-2 py-1 text-left">Avisos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {parsedRows.map((row) => (
                      <tr
                        key={row.legacyRowId}
                        className={row.warnings.length > 0 ? "bg-amber-50" : ""}
                      >
                        <td className="px-2 py-1">{row.legacyRowId}</td>
                        <td className="px-2 py-1">
                          {row.head.fullName}
                          {row.members.length > 0 ? ` +${row.members.length}` : ""}
                        </td>
                        <td className="px-2 py-1">{row.head.email ?? "-"}</td>
                        <td className="px-2 py-1">{row.closerNameRaw ?? "-"}</td>
                        <td className="px-2 py-1">
                          {row.durationMonths}
                          {row.durationAssumed ? "*" : ""}
                        </td>
                        <td className="px-2 py-1">{row.installments.length}</td>
                        <td className="px-2 py-1 text-right">${row.pendingAmount}</td>
                        <td className="px-2 py-1">{row.status}</td>
                        <td className="px-2 py-1">
                          {row.warnings.length > 0 && (
                            <AlertTriangle size={13} className="text-amber-700" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <FileSpreadsheet size={18} className="shrink-0 text-slate-600" />
            <div>
              <strong>Esto es solo una vista previa.</strong> Nada se escribió a la base de datos.
              <p className="mt-1">
                La confirmación y escritura transaccional se habilitarán en la siguiente tanda.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  color = "slate",
}: {
  label: string;
  value: number;
  color?: "slate" | "emerald" | "amber" | "rose";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-900",
    emerald: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-900",
    rose: "bg-rose-100 text-rose-900",
  };
  return (
    <div className={`rounded-md px-3 py-2 ${colors[color]}`}>
      <div className="text-xs uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
