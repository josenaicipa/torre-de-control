"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignForm({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 3) {
      setError("Ingresa tu nombre completo para firmar");
      return;
    }
    if (!accepted) {
      setError("Debes aceptar el contrato para firmar");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/contratos/firmar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: name.trim(), accepted }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "No se pudo firmar el contrato");
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red al firmar el contrato");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Nombre completo del firmante</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        Acepto las condiciones descritas en este contrato.
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Firmando..." : "Firmar contrato"}
      </button>
    </form>
  );
}
