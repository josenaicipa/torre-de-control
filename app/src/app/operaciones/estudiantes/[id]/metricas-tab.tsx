"use client";

import { useEffect, useState } from "react";

interface Metric {
  id: string;
  year: number;
  month: number;
  revenue: string | number;
  currency: string;
  orders: number;
  status: string | null;
  notes: string | null;
  reportedAt: string | null;
  reportedBy: { id: string; name: string | null; email: string } | null;
}

const MONTH_LABELS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function toNum(value: string | number): number {
  return typeof value === "number" ? value : parseFloat(value);
}

function formatMoney(value: string | number, currency: string): string {
  return `${currency} ${toNum(value).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

export function MetricasTab({ studentId, canWrite }: { studentId: string; canWrite: boolean }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ month: number; currency: string } | null>(
    null,
  );

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/operaciones/students/${studentId}/metrics?year=${year}`);
      const json = await res.json();
      setMetrics(json.metrics ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [studentId, year]);

  if (loading) return <p className="text-sm text-slate-500">Cargando métricas...</p>;

  const currencies = Array.from(new Set(metrics.map((metric) => metric.currency)));
  const primaryCurrency = currencies[0] ?? "COP";
  const byCurrencyMonth: Record<string, Record<number, Metric>> = {};
  const totalsByCurrency: Record<string, { revenue: number; orders: number }> = {};

  for (const metric of metrics) {
    if (!byCurrencyMonth[metric.currency]) byCurrencyMonth[metric.currency] = {};
    byCurrencyMonth[metric.currency][metric.month] = metric;
    if (!totalsByCurrency[metric.currency]) {
      totalsByCurrency[metric.currency] = { revenue: 0, orders: 0 };
    }
    totalsByCurrency[metric.currency].revenue += toNum(metric.revenue);
    totalsByCurrency[metric.currency].orders += metric.orders;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Facturación mensual del estudiante</h3>
          <p className="text-sm text-slate-500">
            Reportado por el mentor cada mes (no es lo que paga a Unlocked).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(year - 1)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            ←
          </button>
          <span className="text-sm font-bold">{year}</span>
          <button
            onClick={() => setYear(year + 1)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">
                Moneda
              </th>
              {MONTH_LABELS.map((label) => (
                <th
                  key={label}
                  className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-600"
                >
                  {label}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-600">
                Total año
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {currencies.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-sm text-slate-500">
                  Sin métricas registradas para {year}.
                </td>
              </tr>
            ) : (
              currencies.map((currency) => (
                <tr key={currency}>
                  <td className="px-3 py-2 text-sm font-bold">{currency}</td>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                    const metric = byCurrencyMonth[currency]?.[month];
                    return (
                      <td
                        key={month}
                        onClick={
                          canWrite ? () => setEditingCell({ month, currency }) : undefined
                        }
                        className={`px-2 py-2 text-center text-xs ${
                          canWrite ? "cursor-pointer hover:bg-slate-50" : ""
                        }`}
                        title={
                          metric ? `${metric.orders} pedidos - ${metric.status ?? ""}` : "Sin datos"
                        }
                      >
                        {metric ? (
                          <div>
                            <div className="font-medium text-slate-900">
                              {formatMoney(metric.revenue, currency).replace(`${currency} `, "")}
                            </div>
                            <div className="text-slate-400">{metric.orders}</div>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right text-sm font-bold">
                    {formatMoney(totalsByCurrency[currency]?.revenue ?? 0, currency)}
                    <div className="text-xs font-normal text-slate-500">
                      {totalsByCurrency[currency]?.orders ?? 0} pedidos
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              setEditingCell({ month: new Date().getMonth() + 1, currency: primaryCurrency })
            }
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800"
          >
            + Reportar mes
          </button>
          <p className="self-center text-xs text-slate-500">
            Tip: click en cualquier celda de la tabla para editar ese mes.
          </p>
        </div>
      )}

      {editingCell && (
        <MetricDialog
          studentId={studentId}
          year={year}
          month={editingCell.month}
          currency={editingCell.currency}
          existing={byCurrencyMonth[editingCell.currency]?.[editingCell.month]}
          onClose={() => setEditingCell(null)}
          onSaved={() => {
            setEditingCell(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function MetricDialog({
  studentId,
  year,
  month,
  currency,
  existing,
  onClose,
  onSaved,
}: {
  studentId: string;
  year: number;
  month: number;
  currency: string;
  existing?: Metric;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const body = {
      year,
      month,
      revenue: Number(formData.get("revenue")),
      currency: String(formData.get("currency")),
      orders: Number(formData.get("orders")),
      status: (formData.get("status") as string) || "reportado",
      notes: (formData.get("notes") as string) || null,
    };
    const res = await fetch(`/api/operaciones/students/${studentId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Error al guardar");
      setLoading(false);
      return;
    }
    onSaved();
  }

  async function onDelete() {
    if (!existing || !window.confirm("¿Eliminar el reporte de este mes?")) return;
    const res = await fetch(
      `/api/operaciones/students/${studentId}/metrics/${existing.id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      window.alert(json.error ?? "Error al eliminar");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={onSubmit} className="my-8 w-full max-w-md space-y-3 rounded-lg bg-white p-6">
        <h3 className="text-lg font-bold">
          {existing ? "Editar" : "Reportar"} {MONTH_LABELS[month - 1]} {year}
        </h3>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <label className="block">
          <span className="text-sm font-medium">Facturación del mes</span>
          <input
            name="revenue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={existing ? toNum(existing.revenue) : ""}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Moneda</span>
          <select
            name="currency"
            defaultValue={existing?.currency ?? currency}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="COP">COP</option>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Pedidos en el mes</span>
          <input
            name="orders"
            type="number"
            min="0"
            step="1"
            defaultValue={existing?.orders ?? 0}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Estado</span>
          <select
            name="status"
            defaultValue={existing?.status ?? "reportado"}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="reportado">Reportado</option>
            <option value="pendiente">Pendiente</option>
            <option value="verificado">Verificado</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Notas</span>
          <textarea
            name="notes"
            rows={2}
            defaultValue={existing?.notes ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-center justify-between pt-2">
          <div>
            {existing && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
              >
                Eliminar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium !text-white disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
