"use client";

import Link from "next/link";

interface MentorRow {
  id: string;
  name: string | null;
  email: string;
  ghlUserName: string | null;
  active: boolean;
  _count: { studentsAsMentor: number };
}

export function MentoresClient({ mentors, canCreate }: { mentors: MentorRow[]; canCreate: boolean }) {
  return (
    <div>
      {canCreate && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Para crear un nuevo mentor, crea un usuario con rol Mentor en administración de usuarios.
          </p>
          <Link
            href="/admin/users"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ir a usuarios
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Correo</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre GHL</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Estudiantes asignados</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Activo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {mentors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay mentores cargados.</td>
              </tr>
            ) : (
              mentors.map((mentor) => (
                <tr key={mentor.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">{mentor.name ?? mentor.email}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{mentor.email}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{mentor.ghlUserName ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{mentor._count.studentsAsMentor}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{mentor.active ? "Activo" : "Inactivo"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
