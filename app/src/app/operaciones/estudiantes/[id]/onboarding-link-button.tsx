"use client";

import { useState } from "react";

export function OnboardingLinkButton({
  studentId,
  hasSoldProduct,
  completedAt,
}: {
  studentId: string;
  hasSoldProduct: boolean;
  completedAt: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateLink() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operaciones/students/${studentId}/onboarding-link`,
        { method: "POST" },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? "No se pudo generar el link de onboarding");
        return;
      }
      setUrl(json.url ?? null);
      if (json.url) {
        try {
          await navigator.clipboard.writeText(json.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Sin portapapeles disponible: mostramos el link para copiar a mano.
        }
      }
    } catch {
      setError("Error de red al generar el link de onboarding");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el link");
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Onboarding del estudiante
          </p>
          {completedAt ? (
            <p className="mt-1 text-sm text-emerald-700">
              Completado el {completedAt}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Genera el link para que el estudiante complete sus datos.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={generateLink}
          disabled={loading || !hasSoldProduct}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading
            ? "Generando..."
            : completedAt
              ? "Regenerar link"
              : "Generar link"}
        </button>
      </div>

      {!hasSoldProduct && (
        <p className="mt-2 text-xs text-amber-700">
          El estudiante no tiene un producto vendido activo.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {url && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
            />
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
