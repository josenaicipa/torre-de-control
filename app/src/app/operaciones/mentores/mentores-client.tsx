"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MentorRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  user: { id: string; email: string; active: boolean } | null;
  _count: { students: number };
}

export function MentoresClient({ mentors, canCreate }: { mentors: MentorRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/operaciones/mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("email"),
          phone: (fd.get("phone") as string) || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al crear mentor");
        setLoading(false);
        return;
      }
      setShowForm(false);
      setLoading(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setLoading(false);
    }
  }

  return (
    <div>
      {canCreate && (
        <div className="mb-4">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              + Nuevo mentor
            </button>
          ) : (
            <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-4">
              <input name="name" placeholder="Nombre" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="email" type="email" placeholder="Email" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="phone" placeholder="Teléfono (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              {error && <p className="col-span-3 text-sm text-rose-700">{error}</p>}
              <div className="col-span-3 flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
                <button type="submit" disabled={loading} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">
                  {loading ? "Creando..." : "Crear"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Teléfono</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Cuenta</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Estudiantes</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {mentors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No hay mentores cargados.</td>
              </tr>
            ) : (
              mentors.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">{m.name}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{m.email}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{m.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{m.user ? `Vinculada (${m.user.email})` : "Sin cuenta"}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{m._count.students}</td>
                  <td className="px-4 py-2 text-sm">{m.active ? "✅" : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
