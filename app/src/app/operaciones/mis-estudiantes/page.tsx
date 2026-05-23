import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MisEstudiantesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "MENTOR") redirect("/operaciones/estudiantes");
  if (!actor.mentorUserId) redirect("/operaciones");
  const students = await prisma.student.findMany({
    where: { mentorUserId: actor.mentorUserId },
    orderBy: { fullName: "asc" },
  });
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Mis Estudiantes ({students.length})</h1>
      <p className="text-sm text-slate-500 mb-4">Vista mentor — solo tus estudiantes asignados.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Programa</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Fin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {students.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No tenés estudiantes asignados.</td></tr>
            ) : students.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2 text-sm"><a href={`/operaciones/estudiantes/${s.id}`} className="font-medium text-slate-900 hover:underline">{s.fullName}</a></td>
                <td className="px-4 py-2 text-sm text-slate-600">Nivel 5 + Clases Avanzadas</td>
                <td className="px-4 py-2 text-sm text-slate-600">{s.status}</td>
                <td className="px-4 py-2 text-sm text-slate-600">{s.endDate.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
