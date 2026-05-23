"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Mentor { id: string; name: string }
interface Program { id: string; slug: string; name: string; durationMonthsDefault: number }

export function NuevoEstudianteForm({
  mentors,
  programs,
}: {
  mentors: Mentor[];
  programs: Program[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const programId = (fd.get("programId") as string) || null;
    const mentorId = (fd.get("mentorId") as string) || null;

    const body = {
      fullName: fd.get("fullName") as string,
      email: fd.get("email") as string,
      phone: (fd.get("phone") as string) || null,
      startDate: fd.get("startDate") as string,
      durationMonths: Number(fd.get("durationMonths")),
      mentorId,
      programId,
      legalName: (fd.get("legalName") as string) || null,
      notes: (fd.get("notes") as string) || null,
    };

    try {
      const res = await fetch("/api/operaciones/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Error al crear estudiante");
        setLoading(false);
        return;
      }
      router.push(`/operaciones/estudiantes/${json.student.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700">Nombre completo *</label>
        <input name="fullName" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Nombre legal (opcional)</label>
        <input name="legalName" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email *</label>
          <input name="email" type="email" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Teléfono (E.164)</label>
          <input name="phone" placeholder="+573001234567" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Programa</label>
          <select name="programId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Sin programa —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Mentor líder</label>
          <select name="mentorId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— Sin asignar —</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Fecha de inicio *</label>
          <input name="startDate" type="date" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Duración (meses) *</label>
          <input name="durationMonths" type="number" min={1} max={60} defaultValue={12} required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Notas</label>
        <textarea name="notes" rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Crear estudiante"}
        </button>
      </div>
    </form>
  );
}
