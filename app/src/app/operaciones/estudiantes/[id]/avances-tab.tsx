"use client";

import { daysSinceLastUpdate, needsProgressAlert } from "@/domain/progress";
import { useEffect, useState } from "react";

interface ProgressUpdate {
  id: string;
  periodStart: string;
  periodEnd: string;
  progressLevel: "ALTO" | "MEDIO" | "BAJO" | "SIN_DATO";
  bottleneck: string | null;
  notes: string;
  rating: number | null;
  monthlyRevenue: string | number | null;
  monthlyRevenueCurrency: string | null;
  monthlyOrders: number | null;
  submittedAt: string;
  mentorUser: { id: string; name: string | null; email: string } | null;
  submittedBy: { id: string; name: string | null; email: string } | null;
}

function ProgressBadge({ level }: { level: string }) {
  const labels: Record<string, [string, string]> = {
    ALTO: ["Alto", "bg-emerald-100 text-emerald-700"],
    MEDIO: ["Medio", "bg-amber-100 text-amber-700"],
    BAJO: ["Bajo", "bg-rose-100 text-rose-700"],
    SIN_DATO: ["Sin dato", "bg-slate-100 text-slate-600"],
  };
  const [label, className] = labels[level] ?? [level, "bg-slate-100 text-slate-600"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function formatRevenue(value: string | number, currency: string | null): string {
  return `${currency ?? ""} ${Number(value).toLocaleString("es-CO")}`.trim();
}

export function AvancesTab({
  studentId,
  canWrite,
}: {
  studentId: string;
  canWrite: boolean;
}) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/operaciones/students/${studentId}/progress`);
      const json = await response.json();
      if (!response.ok) {
        setLoadError(json.error ?? "No se pudieron cargar los avances");
        return;
      }
      setUpdates(json.updates ?? []);
    } catch {
      setLoadError("No se pudieron cargar los avances");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload whenever the viewed student changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <p className="text-sm text-slate-500">Cargando avances...</p>;
  if (loadError) return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>;

  const lastUpdate = updates[0];
  const daysSinceLast = lastUpdate
    ? daysSinceLastUpdate(new Date(lastUpdate.periodEnd), new Date())
    : Number.POSITIVE_INFINITY;
  const showAlert = needsProgressAlert(
    lastUpdate ? new Date(lastUpdate.periodEnd) : null,
    new Date(),
  );

  return (
    <div className="space-y-6">
      {showAlert && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {!lastUpdate ? (
            <p>
              <strong>Sin avances registrados.</strong> Este estudiante todavía no tiene seguimiento cargado.
            </p>
          ) : (
            <p>
              <strong>Avance atrasado.</strong> Han pasado {daysSinceLast} días desde el último avance (
              {lastUpdate.periodEnd.slice(0, 10)}). Se espera uno cada 15 días.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Avances registrados</h3>
          <p className="text-sm text-slate-500">
            {updates.length} {updates.length === 1 ? "registro" : "registros"}
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nuevo avance
          </button>
        )}
      </div>

      {updates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No hay avances registrados.
        </div>
      ) : (
        <ol className="space-y-3">
          {updates.map((update) => (
            <li key={update.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ProgressBadge level={update.progressLevel} />
                    <span className="text-sm font-medium text-slate-700">
                      {update.periodStart.slice(0, 10)} - {update.periodEnd.slice(0, 10)}
                    </span>
                    {update.rating && <span className="text-xs text-slate-500">Rating: {update.rating}/5</span>}
                  </div>
                  {update.bottleneck && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium text-slate-500">Cuello de botella:</span>{" "}
                      <span className="text-slate-900">{update.bottleneck}</span>
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{update.notes}</p>
                  {(update.monthlyRevenue !== null || update.monthlyOrders !== null) && (
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                      {update.monthlyRevenue !== null && (
                        <span>Facturación: {formatRevenue(update.monthlyRevenue, update.monthlyRevenueCurrency)}</span>
                      )}
                      {update.monthlyOrders !== null && <span>Pedidos: {update.monthlyOrders}</span>}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-slate-500">
                  <p>Mentor: {update.mentorUser?.name ?? update.mentorUser?.email ?? "—"}</p>
                  {update.submittedBy && update.submittedBy.id !== update.mentorUser?.id && (
                    <p>Cargado por: {update.submittedBy.name ?? update.submittedBy.email}</p>
                  )}
                  <p className="mt-1">{update.submittedAt.slice(0, 10)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {showForm && (
        <ProgressUpdateDialog
          studentId={studentId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function ProgressUpdateDialog({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const today = new Date();
  const periodEnd = today.toISOString().slice(0, 10);
  const periodStart = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const revenue = String(formData.get("monthlyRevenue") ?? "").trim();
    const orders = String(formData.get("monthlyOrders") ?? "").trim();
    const rating = String(formData.get("rating") ?? "").trim();
    const body = {
      periodStart: String(formData.get("periodStart")),
      periodEnd: String(formData.get("periodEnd")),
      progressLevel: String(formData.get("progressLevel")),
      bottleneck: String(formData.get("bottleneck") ?? "").trim() || null,
      notes: String(formData.get("notes")),
      rating: rating ? Number(rating) : null,
      monthlyRevenue: revenue ? Number(revenue) : null,
      monthlyRevenueCurrency: revenue
        ? String(formData.get("monthlyRevenueCurrency"))
        : null,
      monthlyOrders: orders ? Number(orders) : null,
    };

    try {
      const response = await fetch(`/api/operaciones/students/${studentId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "Error al guardar avance");
        setLoading(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de red al guardar avance");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={onSubmit} className="my-8 w-full max-w-lg space-y-3 rounded-lg bg-white p-6">
        <h3 className="text-lg font-bold text-slate-900">Nuevo avance quincenal</h3>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Período desde">
            <input name="periodStart" type="date" defaultValue={periodStart} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Período hasta">
            <input name="periodEnd" type="date" defaultValue={periodEnd} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
        </div>

        <Field label="Nivel de progreso *">
          <select name="progressLevel" defaultValue="MEDIO" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="ALTO">Alto</option>
            <option value="MEDIO">Medio</option>
            <option value="BAJO">Bajo</option>
            <option value="SIN_DATO">Sin dato</option>
          </select>
        </Field>

        <Field label="Cuello de botella">
          <input name="bottleneck" maxLength={500} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>

        <Field label="Observaciones *">
          <textarea name="notes" rows={4} maxLength={5000} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>

        <Field label="Rating (opcional, 1-5)">
          <input name="rating" type="number" min={1} max={5} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-600">
            Facturación del estudiante (opcional)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Monto" small>
              <input name="monthlyRevenue" type="number" step="0.01" min={0} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </Field>
            <Field label="Moneda" small>
              <select name="monthlyRevenueCurrency" defaultValue="COP" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="COP">COP</option>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
            <Field label="Pedidos" small>
              <input name="monthlyOrders" type="number" min={0} step={1} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar avance"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  small = false,
  children,
}: {
  label: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={small ? "text-xs text-slate-600" : "text-sm font-medium text-slate-700"}>{label}</span>
      {children}
    </label>
  );
}
