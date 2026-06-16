"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface LegalData {
  legalName: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  legalAddress: string | null;
  legalCity: string | null;
  legalCountry: string | null;
}

export function LegalDataForm({
  studentId,
  initial,
}: {
  studentId: string;
  initial: LegalData;
}) {
  const router = useRouter();
  const [state, setState] = useState({
    legalName: initial.legalName ?? "",
    phone: initial.phone ?? "",
    documentType: initial.documentType ?? "",
    documentNumber: initial.documentNumber ?? "",
    legalAddress: initial.legalAddress ?? "",
    legalCity: initial.legalCity ?? "",
    legalCountry: initial.legalCountry ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof typeof state>(key: K, value: string) {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function trimmedOrNull(value: string): string | null {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/operaciones/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: trimmedOrNull(state.legalName),
          phone: trimmedOrNull(state.phone),
          documentType: trimmedOrNull(state.documentType),
          documentNumber: trimmedOrNull(state.documentNumber),
          legalAddress: trimmedOrNull(state.legalAddress),
          legalCity: trimmedOrNull(state.legalCity),
          legalCountry: trimmedOrNull(state.legalCountry),
        }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "No se pudieron guardar los datos legales");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Error de red al guardar los datos legales");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          Datos legales para contrato
        </h3>
        <p className="text-xs text-slate-500">
          Estos datos se usan para generar el contrato del estudiante.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {saved && !error && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Datos legales guardados.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <LegalField label="Nombre legal">
          <input
            type="text"
            value={state.legalName}
            onChange={(e) => update("legalName", e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="Teléfono">
          <input
            type="text"
            value={state.phone}
            onChange={(e) => update("phone", e.target.value)}
            maxLength={50}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="Tipo de documento">
          <input
            type="text"
            value={state.documentType}
            onChange={(e) => update("documentType", e.target.value)}
            maxLength={50}
            placeholder="Cédula de Ciudadanía"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="Número de documento">
          <input
            type="text"
            value={state.documentNumber}
            onChange={(e) => update("documentNumber", e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="Dirección / domicilio">
          <input
            type="text"
            value={state.legalAddress}
            onChange={(e) => update("legalAddress", e.target.value)}
            maxLength={300}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="Ciudad">
          <input
            type="text"
            value={state.legalCity}
            onChange={(e) => update("legalCity", e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
        <LegalField label="País">
          <input
            type="text"
            value={state.legalCountry}
            onChange={(e) => update("legalCountry", e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </LegalField>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar datos legales"}
        </button>
      </div>
    </form>
  );
}

function LegalField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
