"use client";

import { useEffect, useState } from "react";

const CLAUSES_ENDPOINT = "/api/operaciones/settings/contract-clauses";

const MAX_CLAUSES = 10;
const MAX_HEADING_LENGTH = 120;
const MAX_BODY_LENGTH = 4000;

interface ClauseDraft {
  heading: string;
  body: string;
}

interface LoadedClause {
  heading: string;
  paragraphs: string[];
}

function clauseFromLoaded(c: LoadedClause): ClauseDraft {
  return { heading: c.heading, body: c.paragraphs.join("\n") };
}

export function ContractClausesConfig() {
  const [clauses, setClauses] = useState<ClauseDraft[]>([]);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(CLAUSES_ENDPOINT);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(
          json.error ?? "No se pudieron cargar las cláusulas manuales",
        );
        return;
      }
      const loaded: LoadedClause[] = Array.isArray(json.clauses)
        ? json.clauses
        : [];
      setClauses(loaded.map(clauseFromLoaded));
      setUpdatedByName(json.updatedByName ?? null);
      setUpdatedAt(json.updatedAt ?? null);
    } catch {
      setLoadError("No se pudieron cargar las cláusulas manuales");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateClause(index: number, patch: Partial<ClauseDraft>) {
    setSaveOk(false);
    setSaveError(null);
    setClauses((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  }

  function addClause() {
    setSaveOk(false);
    setSaveError(null);
    setClauses((prev) =>
      prev.length >= MAX_CLAUSES ? prev : [...prev, { heading: "", body: "" }],
    );
  }

  function deleteClause(index: number) {
    setSaveOk(false);
    setSaveError(null);
    setClauses((prev) => prev.filter((_, i) => i !== index));
  }

  function moveClause(index: number, direction: -1 | 1) {
    setSaveOk(false);
    setSaveError(null);
    setClauses((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const payload = {
        clauses: clauses.map((c) => ({
          heading: c.heading,
          body: c.body,
        })),
      };
      const res = await fetch(CLAUSES_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(json.error ?? "No se pudieron guardar las cláusulas");
        return;
      }
      setSaveOk(true);
      await load();
    } catch {
      setSaveError("Error de red al guardar las cláusulas");
    } finally {
      setSaving(false);
    }
  }

  const atLimit = clauses.length >= MAX_CLAUSES;

  return (
    <div className="mt-6 max-w-3xl rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">
        Cláusulas manuales del contrato
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Estas cláusulas se anexan al final de los contratos. Puedes agregar
        hasta {MAX_CLAUSES} cláusulas, cada una con un título y un cuerpo.
        Usa una línea por párrafo; las líneas que empiezan con &quot;- &quot;
        se renderizan como viñetas.
      </p>
      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Los cambios solo aplican a contratos nuevos o aún no firmados. Los
        contratos ya firmados quedan congelados con el texto vigente en el
        momento de la firma.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando cláusulas...</p>
      ) : loadError ? (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {(updatedByName || updatedAt) && (
            <p className="text-xs text-slate-500">
              Última actualización
              {updatedByName ? ` por ${updatedByName}` : ""}
              {updatedAt ? ` · ${updatedAt.slice(0, 10)}` : ""}
            </p>
          )}

          {clauses.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              Aún no hay cláusulas manuales configuradas. Agrega la primera
              con el botón de abajo.
            </p>
          ) : (
            <ol className="space-y-4">
              {clauses.map((clause, index) => {
                const headingOver = clause.heading.length > MAX_HEADING_LENGTH;
                const bodyOver = clause.body.length > MAX_BODY_LENGTH;
                return (
                  <li
                    key={index}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        Cláusula {index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveClause(index, -1)}
                          disabled={index === 0 || saving}
                          aria-label="Subir cláusula"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveClause(index, 1)}
                          disabled={index === clauses.length - 1 || saving}
                          aria-label="Bajar cláusula"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteClause(index)}
                          disabled={saving}
                          className="rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-xs font-medium text-slate-700">
                        Título
                      </label>
                      <input
                        type="text"
                        value={clause.heading}
                        onChange={(e) =>
                          updateClause(index, { heading: e.target.value })
                        }
                        placeholder="Ej. CONFIDENCIALIDAD"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                      <p
                        className={`mt-1 text-xs ${
                          headingOver ? "text-rose-600" : "text-slate-500"
                        }`}
                      >
                        {clause.heading.length}/{MAX_HEADING_LENGTH}
                      </p>
                    </div>

                    <div className="mt-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Cuerpo
                      </label>
                      <textarea
                        value={clause.body}
                        onChange={(e) =>
                          updateClause(index, { body: e.target.value })
                        }
                        rows={6}
                        placeholder={
                          "Una línea por párrafo.\n- Las líneas que empiezan con \"- \" se vuelven viñetas."
                        }
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                      />
                      <p
                        className={`mt-1 text-xs ${
                          bodyOver ? "text-rose-600" : "text-slate-500"
                        }`}
                      >
                        {clause.body.length}/{MAX_BODY_LENGTH}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div>
            <button
              type="button"
              onClick={addClause}
              disabled={atLimit || saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Agregar cláusula
            </button>
            {atLimit && (
              <span className="ml-3 text-xs text-slate-500">
                Llegaste al máximo de {MAX_CLAUSES} cláusulas.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cláusulas"}
            </button>
            {saveOk && (
              <span className="text-sm font-medium text-emerald-700">
                Cláusulas guardadas correctamente.
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
