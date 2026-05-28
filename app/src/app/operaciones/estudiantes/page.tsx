import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { mergeStudentScope } from "@/lib/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface SearchParams {
  search?: string;
  status?: string;
  mentorUserId?: string;
  closerUserId?: string;
  page?: string;
}

export default async function EstudiantesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = 50;

  const where: Record<string, unknown> = {};
  if (sp.search) {
    where.OR = [
      { fullName: { contains: sp.search, mode: "insensitive" } },
      { email: { contains: sp.search, mode: "insensitive" } },
    ];
  }
  if (sp.status) where.status = sp.status;
  if (sp.mentorUserId) where.mentorUserId = sp.mentorUserId;
  if (sp.closerUserId) where.closerUserId = sp.closerUserId;

  const scoped = mergeStudentScope(actor, where);

  const [items, total, mentors, closers] = await Promise.all([
    prisma.student.findMany({
      where: scoped as never,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        mentorUser: { select: { id: true, name: true, email: true } },
        closerUser: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.student.count({ where: scoped as never }),
    prisma.user.findMany({
      where: { role: "MENTOR", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Estudiantes</h1>
          <p className="text-sm text-slate-500">
            {total} {total === 1 ? "estudiante" : "estudiantes"}
          </p>
        </div>
        {(actor.role === "ADMIN" || actor.role === "OPERATOR") && (
          <Link
            href="/operaciones/estudiantes/nuevo"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nuevo estudiante
          </Link>
        )}
      </div>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input
          type="text"
          name="search"
          placeholder="Buscar por nombre o correo..."
          defaultValue={sp.search ?? ""}
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activo</option>
          <option value="PAUSED">Pausado</option>
          <option value="COMPLETED">Completado</option>
          <option value="DROPPED">Retirado</option>
          <option value="EXTENDED">Extendido</option>
          <option value="ACCESS_REVOKED">Sin accesos</option>
        </select>
        <select
          name="mentorUserId"
          defaultValue={sp.mentorUserId ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los mentores</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
          ))}
        </select>
        <select
          name="closerUserId"
          defaultValue={sp.closerUserId ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los closers</option>
          {closers.map((closer) => (
            <option key={closer.id} value={closer.id}>{closer.name ?? closer.email}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-slate-200 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-300"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Correo</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Mentor</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Closer</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Inicio</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Fin</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No hay estudiantes para mostrar.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm">
                    <Link href={`/operaciones/estudiantes/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{s.email}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{s.mentorUser?.name ?? s.mentorUser?.email ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{s.closerUser?.name ?? s.closerUser?.email ?? "—"}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{s.startDate.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{s.endDate.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2 text-sm">
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>Página {page} de {totalPages}</span>
          <div className="space-x-2">
            {page > 1 && (
              <a href={`?page=${page - 1}`} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">← Anterior</a>
            )}
            {page < totalPages && (
              <a href={`?page=${page + 1}`} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50">Siguiente →</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    PAUSED: "bg-amber-100 text-amber-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    DROPPED: "bg-slate-200 text-slate-700",
    EXTENDED: "bg-purple-100 text-purple-700",
    ACCESS_REVOKED: "bg-rose-100 text-rose-700",
  };
  const labels: Record<string, string> = {
    ACTIVE: "Activo",
    PAUSED: "Pausado",
    COMPLETED: "Completado",
    DROPPED: "Retirado",
    EXTENDED: "Extendido",
    ACCESS_REVOKED: "Sin accesos",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-slate-100 text-slate-700"}`}>
      {labels[status] ?? status}
    </span>
  );
}
