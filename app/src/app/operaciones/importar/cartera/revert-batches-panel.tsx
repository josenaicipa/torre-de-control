"use client";

import { AlertTriangle, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface BatchSummary {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  createdContacts: number;
  createdAt: string;
  confirmedAt: string | null;
  studentsCount: number;
}

interface RevertResult {
  batchId: string;
  filename: string;
  studentsDeleted: number;
  membersDeleted: number;
  schedulesDeleted: number;
  paymentsDeleted: number;
  attributionsDeleted: number;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

export function RevertBatchesPanel() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [result, setResult] = useState<RevertResult | null>(null);

  async function loadBatches() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/operaciones/import/cartera/batches", {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        batches?: BatchSummary[];
        error?: string;
      };
      if (!response.ok || !json.batches) {
        setError(json.error ?? "No se pudieron cargar las importaciones");
        return;
      }
      setBatches(json.batches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  async function onRevert(batch: BatchSummary) {
    const confirmed = window.confirm(
      `⚠️ Vas a BORRAR la importación "${batch.filename}".\n\n` +
        `Esto elimina de forma permanente los ${batch.studentsCount} estudiante(s) creados por este lote ` +
        `junto con sus pagos, cuotas, miembros y atribuciones de closer.\n\n` +
        `Los estudiantes que ya existían y fueron omitidos NO se tocan.\n\n` +
        `¿Confirmás borrar este lote?`,
    );
    if (!confirmed) return;

    setDeletingId(batch.id);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/operaciones/import/cartera/batches/${batch.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmBatchId: batch.id }),
        },
      );
      const json = (await response.json()) as {
        ok?: boolean;
        result?: RevertResult;
        error?: string;
      };
      if (!response.ok || !json.ok || !json.result) {
        setError(json.error ?? "No se pudo borrar la importación");
        return;
      }
      setResult(json.result);
      await loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <RotateCcw size={18} className="text-rose-700" />
        <h2 className="text-lg font-semibold text-slate-900">
          Borrar importación (reversión)
        </h2>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          Borrar una importación elimina <strong>permanentemente</strong> los
          estudiantes, pagos, cuotas, miembros y atribuciones creados por ese lote.
          Los estudiantes preexistentes (omitidos por el importador) no se modifican.
          Esta acción no se puede deshacer.
        </span>
      </div>

      {result && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={18} className="shrink-0" />
            Importación revertida ({result.filename})
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            <li>Estudiantes borrados: {result.studentsDeleted}</li>
            <li>Miembros borrados: {result.membersDeleted}</li>
            <li>Cuotas borradas: {result.schedulesDeleted}</li>
            <li>Pagos borrados: {result.paymentsDeleted}</li>
            <li>Atribuciones borradas: {result.attributionsDeleted}</li>
          </ul>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando importaciones...</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-slate-500">
          No hay importaciones de cartera histórica registradas.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Archivo</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Fecha</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">
                  Estudiantes
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Estado</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{batch.filename}</div>
                    <div className="font-mono text-xs text-slate-400">{batch.id}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{formatDate(batch.createdAt)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {batch.studentsCount}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{batch.status}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRevert(batch)}
                      disabled={deletingId !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium !text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      {deletingId === batch.id ? "Borrando..." : "Borrar esta importación"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
