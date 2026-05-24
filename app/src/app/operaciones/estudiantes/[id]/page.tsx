import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { PagosTab } from "./pagos-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "info", label: "Info" },
  { key: "pagos", label: "Pagos" },
  { key: "avances", label: "Avances" },
  { key: "metricas", label: "Métricas" },
  { key: "ventas", label: "Ventas" },
  { key: "cursos-lw", label: "Cursos LW" },
];

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { id } = await params;
  const { tab: activeTab = "info" } = await searchParams;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      mentorUser: { select: { id: true, name: true, email: true } },
      closerUser: { select: { id: true, name: true, email: true } },
      members: true,
      _count: {
        select: {
          paymentSchedules: true,
          payments: true,
          progressUpdates: true,
          monthlyMetrics: true,
          sales: true,
        },
      },
    },
  });
  if (!student) notFound();
  if (!canAccessStudent(actor, student.mentorUserId)) notFound();
  const canWritePayments = actor.role === "ADMIN" || actor.role === "OPERATOR";

  return (
    <div>
      <Link href="/operaciones/estudiantes" className="text-sm text-slate-500 hover:text-slate-900">
        ← Estudiantes
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{student.fullName}</h1>
          <p className="text-sm text-slate-500">{student.email}</p>
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>Inicio: {student.startDate.toISOString().slice(0, 10)}</p>
          <p>Fin: {student.endDate.toISOString().slice(0, 10)}</p>
          <p className="mt-1">Mentor: {student.mentorUser?.name ?? student.mentorUser?.email ?? "—"}</p>
        </div>
      </div>

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex space-x-4">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/operaciones/estudiantes/${id}?tab=${t.key}`}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                activeTab === t.key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {activeTab === "pagos" ? (
        <PagosTab studentId={student.id} canWrite={canWritePayments} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          {activeTab === "info" && <InfoTab student={student} />}
          {activeTab !== "info" && (
          <p className="text-sm text-slate-500">
            Esta pestaña se implementa en Sprint 2.
          </p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoTab({ student }: { student: { fullName: string; email: string; phone: string | null; durationMonths: number; status: string; legalName: string | null; notes: string | null; personality: string | null; ghlContactId: string | null; closerUser: { name: string | null; email: string } | null } }) {
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <dt className="font-medium text-slate-500">Nombre legal</dt>
        <dd className="text-slate-900">{student.legalName ?? "—"}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Teléfono</dt>
        <dd className="text-slate-900">{student.phone ?? "—"}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Programa</dt>
        <dd className="text-slate-900">Nivel 5 + Clases Avanzadas</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Duración</dt>
        <dd className="text-slate-900">{student.durationMonths} meses</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Estado</dt>
        <dd className="text-slate-900">{student.status}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">Closer</dt>
        <dd className="text-slate-900">{student.closerUser?.name ?? student.closerUser?.email ?? "—"}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-500">GHL contact id</dt>
        <dd className="text-slate-900">{student.ghlContactId ?? "—"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="font-medium text-slate-500">Personalidad</dt>
        <dd className="text-slate-900">{student.personality ?? "—"}</dd>
      </div>
      <div className="col-span-2">
        <dt className="font-medium text-slate-500">Notas</dt>
        <dd className="whitespace-pre-wrap text-slate-900">{student.notes ?? "—"}</dd>
      </div>
    </dl>
  );
}
