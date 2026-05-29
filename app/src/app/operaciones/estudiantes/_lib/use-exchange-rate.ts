"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ExchangeRateStatus = "idle" | "loading" | "auto" | "manual" | "error";

interface UseExchangeRateOptions {
  /**
   * Moneda del pago. Solo se autorellena cuando es COP.
   * Si es USD u otra, el hook deja status="idle" y no toca el rate.
   */
  currency: string;
  /** Fecha del pago en formato YYYY-MM-DD. */
  date: string;
  /** Habilitar la lógica (ej: solo cuando hay pago inicial activado). */
  enabled: boolean;
  /** Callback al recibir tasa automática: el padre actualiza su input. */
  onAutoRate: (rate: number) => void;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hook compartido para autocompletar la tasa de cambio oficial (TRM
 * para COP) según fecha del pago, manteniendo la edición manual.
 *
 * El padre conserva el valor del input. El hook avisa con
 * `onAutoRate(rate)` cuando consigue una TRM automática, y expone
 * `markManual()` para indicar que el usuario editó manualmente
 * (a partir de ahí los re-fetch automáticos no pisan el valor).
 *
 * `reset()` vuelve al modo automático y vuelve a pedir la TRM.
 */
export function useExchangeRate({
  currency,
  date,
  enabled,
  onAutoRate,
}: UseExchangeRateOptions) {
  const [status, setStatus] = useState<ExchangeRateStatus>("idle");
  const [source, setSource] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mantener `onAutoRate` por ref para no invalidar el efecto cuando
  // el padre lo redefine en cada render.
  const onAutoRateRef = useRef(onAutoRate);
  useEffect(() => {
    onAutoRateRef.current = onAutoRate;
  });

  const manualRef = useRef(false);
  // Token para descartar respuestas obsoletas si la fecha cambia
  // mientras hay un fetch en vuelo.
  const requestTokenRef = useRef(0);

  const upper = currency.toUpperCase();

  const fetchRate = useCallback(
    async (force: boolean) => {
      if (!enabled) return;
      if (upper !== "COP") return;
      if (!ISO_DATE_RE.test(date)) return;
      if (!force && manualRef.current) return;
      const token = ++requestTokenRef.current;
      setStatus("loading");
      setErrorMessage(null);
      try {
        const res = await fetch(
          `/api/operaciones/exchange-rate?currency=COP&date=${encodeURIComponent(date)}`,
        );
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (token !== requestTokenRef.current) return;
        if (!res.ok) {
          setStatus("error");
          setSource(null);
          setEffectiveDate(null);
          setErrorMessage(
            typeof json?.error === "string"
              ? json.error
              : "No se pudo cargar la TRM del día. Podés ingresarla manualmente.",
          );
          return;
        }
        const rateNum = Number(json?.rate);
        if (!Number.isFinite(rateNum) || rateNum <= 0) {
          setStatus("error");
          setSource(null);
          setEffectiveDate(null);
          setErrorMessage(
            "La fuente TRM devolvió un valor inesperado. Podés ingresarla manualmente.",
          );
          return;
        }
        manualRef.current = false;
        setStatus("auto");
        setSource(typeof json.source === "string" ? json.source : null);
        setEffectiveDate(
          typeof json.effectiveDate === "string" ? json.effectiveDate : null,
        );
        onAutoRateRef.current(rateNum);
      } catch {
        if (token !== requestTokenRef.current) return;
        setStatus("error");
        setSource(null);
        setEffectiveDate(null);
        setErrorMessage(
          "No se pudo cargar la TRM del día (error de red). Podés ingresarla manualmente.",
        );
      }
    },
    [date, enabled, upper],
  );

  useEffect(() => {
    if (!enabled || upper !== "COP") {
      // Pago inicial desactivado o moneda no aplicable: limpiar estado
      // del hook (el padre ya maneja el valor del input).
      manualRef.current = false;
      requestTokenRef.current++;
      setStatus("idle");
      setSource(null);
      setEffectiveDate(null);
      setErrorMessage(null);
      return;
    }
    if (!ISO_DATE_RE.test(date)) {
      return;
    }
    if (manualRef.current) {
      return;
    }
    void fetchRate(false);
  }, [enabled, upper, date, fetchRate]);

  const markManual = useCallback(() => {
    manualRef.current = true;
    setStatus("manual");
    setErrorMessage(null);
  }, []);

  const reset = useCallback(() => {
    manualRef.current = false;
    void fetchRate(true);
  }, [fetchRate]);

  return {
    status,
    source,
    effectiveDate,
    errorMessage,
    markManual,
    reset,
  };
}
