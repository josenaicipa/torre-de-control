import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { studentScopeFor } from "@/lib/access";
import { deriveScheduleStatus } from "@/domain/payments";
import {
  summarizeCartera,
  classifyInstallment,
  installmentPending,
  daysUntilDue,
  compareCarteraBucket,
  type CarteraBucket,
  type CarteraInstallment,
} from "@/lib/cartera";

export const dynamic = "force-dynamic";

type EstadoFilter = "todas" | "vencidas" | "proximas" | "pendientes";

const ESTADO_TO_BUCKET: Record<Exclude<EstadoFilter, "todas">, CarteraBucket> = {
  vencidas: "vencida",
  proximas: "proxima",
  pendientes: "pendiente",
};

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value: number): string {
  return `USD $${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeEstado(value: string | undefined): EstadoFilter {
  if (value === "vencidas" || value === "proximas" || value === "pendientes") {
    return value;
  }
  return "todas";
}

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Cartera no es visible para mentores; el layout ya la oculta del menú, pero
  // bloqueamos también el acceso directo por URL.
  if (actor.role === "MENTOR") redirect("/operaciones/mis-estudiantes");

  const sp = await searchParams;
  const estado = normalizeEstado(sp.estado);

  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      status: { notIn: ["PAID", "WAIVED"] },
      student: studentScopeFor(actor) as never,
    },
    orderBy: { dueDate: "asc" },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          mentorUser: { select: { name: true, email: true } },
          closerUser: { select: { name: true, email: true } },
        },
      },
      enrollment: {
        select: {
          product: { select: { name: true } },
          paymentAccount: { select: { displayName: true } },
        },
      },
    },
  });

  const today = new Date();

  const rows = schedules.map((s) => {
    const amountDue = toNum(s.amountDue);
    const amountPaid = toNum(s.amountPaid);
    const installment: CarteraInstallment = {
      studentId: s.studentId,
      amountDue,
      amountPaid,
      dueDate: s.dueDate,
      status: s.status,
    };
    const bucket = classifyInstallment(installment, today);
    const days = daysUntilDue(s.dueDate, today);
    return {
      id: s.id,
      studentId: s.studentId,
      studentName: s.student.fullName,
      productName: s.enrollment?.product?.name ?? "—",
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      days,
      pendingUsd: installmentPending(installment),
      displayStatus: deriveScheduleStatus(
        { amountDue, amountPaid, dueDate: s.dueDate },
        today,
      ),
      mentor: s.student.mentorUser?.name ?? s.student.mentorUser?.email ?? "—",
      closer: s.student.closerUser?.name ?? s.student.closerUser?.email ?? "—",
      paymentAccount: s.enrollment?.paymentAccount?.displayName ?? null,
      bucket,
    };
  });

  const kpis = summarizeCartera(
    schedules.map((s) => ({
      studentId: s.studentId,
      amountDue: toNum(s.amountDue),
      amountPaid: toNum(s.amountPaid),
      dueDate: s.dueDate,
      status: s.status,
    })),
    today,
  );

  const counts = {
    todas: rows.length,
    vencidas: rows.filter((r) => r.bucket === "vencida").length,
    proximas: rows.filter((r) => r.bucket === "proxima").length,
    pendientes: rows.filter((r) => r.bucket === "pendiente").length,
  };

  const visibleRows = (
    estado === "todas"
      ? rows
      : rows.filter((r) => r.bucket === ESTADO_TO_BUCKET[estado])
  )
    .slice()
    .sort((a, b) => compareCarteraBucket(a, b));

  const filters: { key: EstadoFilter; label: string; count: number }[] = [
    { key: "todas", label: "Todas", count: counts.todas },
    { key: "vencidas", label: "Vencidas", count: counts.vencidas },
    { key: "proximas", label: "Próximas (7 días)", count: counts.proximas },
    { key: "pendientes", label: "Pendientes", count: counts.pendientes },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cartera</h1>
        <p className="text-sm text-slate-500">
          Cuotas por cobrar a estudiantes. Prioriza las vencidas y las que vencen
          en los próximos 7 días para gestionar el recaudo.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total pendiente"
          value={formatUsd(kpis.totalPendingUsd)}
          tone="slate"
        />
        <KpiCard
          label="Total vencido"
          value={formatUsd(kpis.totalOverdueUsd)}
          tone="rose"
        />
        <KpiCard
          label="Cuotas vencidas"
          value={String(kpis.overdueCount)}
          tone="rose"
        />
        <KpiCard
          label="Próximas 7 días"
          value={String(kpis.dueSoonCount)}
          hint={formatUsd(kpis.dueSoonUsd)}
          tone="amber"
        />
        <KpiCard
          label="Estudiantes con mora"
          value={String(kpis.studentsInArrears)}
          tone="rose"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = f.key === estado;
          const href = f.key === "todas" ? "?" : `?estado=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label} ({f.count})
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <Th>Estudiante</Th>
              <Th>Producto</Th>
              <Th>Cuota</Th>
              <Th>Vence</Th>
              <Th>Atraso / faltan</Th>
              <Th>Pendiente</Th>
              <Th>Estado</Th>
              <Th>Mentor</Th>
              <Th>Closer</Th>
              <Th>Cuenta receptora</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-500">
                  {counts.todas === 0
                    ? "No hay cuotas pendientes de cobro. La cartera está al día."
                    : "No hay cuotas en esta categoría."}
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm">
                    <Link
                      href={`/operaciones/estudiantes/${r.studentId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{r.productName}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">#{r.installmentNumber}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{formatDate(r.dueDate)}</td>
                  <td className="px-4 py-2 text-sm">
                    <DaysCell days={r.days} />
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">
                    {formatUsd(r.pendingUsd)}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <StatusBadge status={r.displayStatus} />
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{r.mentor}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{r.closer}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {r.paymentAccount ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <Link
                      href={`/operaciones/estudiantes/${r.studentId}?tab=pagos`}
                      className="font-medium text-slate-700 hover:underline"
                    >
                      Ver pagos
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "slate" | "rose" | "amber";
}) {
  const valueTone: Record<string, string> = {
    slate: "text-slate-900",
    rose: "text-rose-700",
    amber: "text-amber-700",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function DaysCell({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="font-medium text-rose-700">
        {Math.abs(days)} {Math.abs(days) === 1 ? "día" : "días"} de atraso
      </span>
    );
  }
  if (days === 0) {
    return <span className="font-medium text-amber-700">Vence hoy</span>;
  }
  return (
    <span className="text-slate-600">
      faltan {days} {days === 1 ? "día" : "días"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, [string, string]> = {
    PENDING: ["Pendiente", "bg-slate-100 text-slate-700"],
    PAID: ["Pagado", "bg-emerald-100 text-emerald-700"],
    PARTIAL: ["Parcial", "bg-amber-100 text-amber-700"],
    OVERDUE: ["Vencido", "bg-rose-100 text-rose-700"],
    WAIVED: ["Condonado", "bg-slate-200 text-slate-700"],
  };
  const [label, className] = labels[status] ?? [status, "bg-slate-100 text-slate-700"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
