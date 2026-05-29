"use client";

import type { ExchangeRateStatus } from "./use-exchange-rate";

interface ExchangeRateStatusLineProps {
  currency: string;
  status: ExchangeRateStatus;
  effectiveDate: string | null;
  source: string | null;
  errorMessage: string | null;
  paidAt: string;
  onUseToday: () => void;
}

/**
 * Mensaje breve bajo el campo de tasa de cambio.
 * Para COP muestra TRM cargada/manual/error y un botón "Usar TRM del día".
 * Para otras monedas no aplica (no soporta tasa automática).
 */
export function ExchangeRateStatusLine({
  currency,
  status,
  effectiveDate,
  source,
  errorMessage,
  paidAt,
  onUseToday,
}: ExchangeRateStatusLineProps) {
  const upper = currency.toUpperCase();
  if (upper !== "COP") {
    if (upper === "USD") return null;
    return (
      <span className="mt-1 block text-xs text-slate-500">
        Esta moneda no tiene tasa automática: ingresá la tasa manualmente.
      </span>
    );
  }

  const useTodayButton = (
    <button
      type="button"
      onClick={onUseToday}
      disabled={!paidAt || status === "loading"}
      className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      Usar TRM del día
    </button>
  );

  if (status === "loading") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Cargando TRM oficial…</span>
      </div>
    );
  }

  if (status === "auto") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
        <span>
          TRM del día cargada
          {effectiveDate ? ` (vigente desde ${effectiveDate})` : ""}.
        </span>
        {source && <span className="text-slate-500">Fuente: {source}</span>}
        {useTodayButton}
      </div>
    );
  }

  if (status === "manual") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-700">
        <span>Tasa editada manualmente.</span>
        {useTodayButton}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-rose-700">
        <span>{errorMessage ?? "No se pudo cargar la TRM. Ingresala manualmente."}</span>
        {useTodayButton}
      </div>
    );
  }

  // idle
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>Definí la fecha del pago para cargar la TRM oficial.</span>
      {useTodayButton}
    </div>
  );
}
