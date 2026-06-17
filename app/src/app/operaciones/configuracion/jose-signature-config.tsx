"use client";

import { useEffect, useState } from "react";

const SIGNATURE_ENDPOINT = "/api/operaciones/settings/jose-signature";

export function JoseSignatureConfig() {
  const [currentDataUrl, setCurrentDataUrl] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Firma nueva seleccionada (data URL) pendiente de guardar.
  const [newSignature, setNewSignature] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(SIGNATURE_ENDPOINT);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "No se pudo cargar la firma fija de Jose Naicipa");
        return;
      }
      setCurrentDataUrl(json.dataUrl ?? null);
      setUpdatedByName(json.updatedByName ?? null);
      setUpdatedAt(json.updatedAt ?? null);
    } catch {
      setLoadError("No se pudo cargar la firma fija de Jose Naicipa");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function onSelectFile(file: File | null) {
    setSelectError(null);
    setSaveOk(false);
    setSaveError(null);
    if (!file) {
      setNewSignature(null);
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setNewSignature(null);
      setSelectError("La firma debe ser una imagen PNG o JPG");
      return;
    }
    if (file.size > 1_048_576) {
      setNewSignature(null);
      setSelectError("La imagen de la firma supera el límite de 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        setSelectError("No se pudo leer la imagen de la firma");
        return;
      }
      setNewSignature(result);
    };
    reader.onerror = () => setSelectError("No se pudo leer la imagen de la firma");
    reader.readAsDataURL(file);
  }

  async function onSave() {
    if (!newSignature) {
      setSelectError("Selecciona una imagen PNG o JPG de la firma");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch(SIGNATURE_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureImage: newSignature }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(json.error ?? "No se pudo guardar la firma fija");
        return;
      }
      setSaveOk(true);
      setNewSignature(null);
      await load();
    } catch {
      setSaveError("Error de red al guardar la firma fija");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">
        Firma fija de Jose Naicipa
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Se usará automáticamente al aprobar contratos y aparecerá sobre LA EMPRESA
        en el PDF firmado. Súbela una sola vez aquí; no hace falta volver a
        cargarla en cada contrato.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando firma actual...</p>
      ) : loadError ? (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Firma actual</p>
            {currentDataUrl ? (
              <>
                <img
                  src={currentDataUrl}
                  alt="Firma fija actual de Jose Naicipa"
                  className="mt-2 max-h-28 rounded-md border border-slate-200 bg-white p-1"
                />
                {(updatedByName || updatedAt) && (
                  <p className="mt-2 text-xs text-slate-500">
                    {updatedByName ? `Actualizada por ${updatedByName}` : ""}
                    {updatedByName && updatedAt ? " · " : ""}
                    {updatedAt ? updatedAt.slice(0, 10) : ""}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                Aún no hay firma fija configurada. Los contratos no podrán
                aprobarse hasta que subas una.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Subir nueva firma (PNG/JPG)
            </label>
            <p className="mt-0.5 text-xs text-slate-500">Máximo 1 MB.</p>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
            />
            {newSignature && (
              <img
                src={newSignature}
                alt="Vista previa de la nueva firma de Jose Naicipa"
                className="mt-2 max-h-28 rounded-md border border-slate-200 bg-white p-1"
              />
            )}
            {selectError && (
              <p className="mt-2 text-xs text-rose-600">{selectError}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving || !newSignature}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar firma fija"}
            </button>
            {saveOk && (
              <span className="text-sm font-medium text-emerald-700">
                Firma fija guardada correctamente.
              </span>
            )}
          </div>
          {saveError && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {saveError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
