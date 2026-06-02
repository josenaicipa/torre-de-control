import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { studentScopeFor } from "@/lib/access";
import { deriveScheduleStatus } from "@/domain/payments";
import {
  summarizeCartera,
  summarizeStudents,
  compareStudentSummary,
  countStudentsByRisk,
  classifyInstallment,
  installmentPending,
  daysUntilDue,
  type CarteraInstallment,
  type CarteraRiskLevel,
} from "@/lib/cartera";

export const dynamic = "force-dynamic";

type EstadoFilter = "todas" | "vencidas" | "proximas" | "pendientes";

// Compatibilidad con el searchParams histórico (?estado=vencidas|proximas|pendientes).
const ESTADO_TO_RISK: Record<Exclude<EstadoFilter, "todas">, CarteraRiskLevel> = {
  vencidas: "en_mora",
  proximas: "proximo",
  pendientes: "pendiente_futuro",
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

// Clases del filtro activo por estado: tintes suaves con buen contraste, sin
// negros. El inactivo queda claro y neutro.
const FILTER_ACTIVE_CLASSES: Record<EstadoFilter, string> = {
  todas: "border-blue-400 bg-blue-50 text-blue-700",
  vencidas: "border-rose-300 bg-rose-50 text-rose-700",
  proximas: "border-amber-300 bg-amber-50 text-amber-800",
  pendientes: "border-slate-400 bg-slate-100 text-slate-700",
};

const FILTER_INACTIVE_CLASSES =
  "border-slate-300 bg-white text-slate-600 hover:bg-slate-50";

interface DetailInstallment {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  days: number;
  pendingUsd: number;
  displayStatus: string;
  productName: string;
  paymentAccount: string | null;
}

interface StudentMeta {
  studentName: string;
  mentor: string;
  closer: string;
  installments: DetailInstallment[];
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

  const installments: CarteraInstallment[] = schedules.map((s) => ({
    studentId: s.studentId,
    amountDue: toNum(s.amountDue),
    amountPaid: toNum(s.amountPaid),
    dueDate: s.dueDate,
    status: s.status,
  }));

  // Metadatos y detalle de cuotas por estudiante para el render de cada card.
  const metaByStudent = new Map<string, StudentMeta>();
  for (const s of schedules) {
    const amountDue = toNum(s.amountDue);
    const amountPaid = toNum(s.amountPaid);
    const installment: CarteraInstallment = {
      studentId: s.studentId,
      amountDue,
      amountPaid,
      dueDate: s.dueDate,
      status: s.status,
    };
    // Solo cuotas con saldo entran en cartera.
    if (classifyInstallment(installment, today) === null) continue;

    let meta = metaByStudent.get(s.studentId);
    if (!meta) {
      meta = {
        studentName: s.student.fullName,
        mentor: s.student.mentorUser?.name ?? s.student.mentorUser?.email ?? "—",
        closer: s.student.closerUser?.name ?? s.student.closerUser?.email ?? "—",
        installments: [],
      };
      metaByStudent.set(s.studentId, meta);
    }
    meta.installments.push({
      id: s.id,
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      days: daysUntilDue(s.dueDate, today),
      pendingUsd: installmentPending(installment),
      displayStatus: deriveScheduleStatus(
        { amountDue, amountPaid, dueDate: s.dueDate },
        today,
      ),
      productName: s.enrollment?.product?.name ?? "—",
      paymentAccount: s.enrollment?.paymentAccount?.displayName ?? null,
    });
  }

  const kpis = summarizeCartera(installments, today);
  const summaries = summarizeStudents(installments, today);
  const riskCounts = countStudentsByRisk(summaries);

  const visibleSummaries = (
    estado === "todas"
      ? summaries
      : summaries.filter((s) => s.riskLevel === ESTADO_TO_RISK[estado])
  )
    .slice()
    .sort(compareStudentSummary);

  const filters: { key: EstadoFilter; label: string; count: number }[] = [
    { key: "todas", label: "Todos", count: riskCounts.total },
    { key: "vencidas", label: "En mora", count: riskCounts.en_mora },
    { key: "proximas", label: "Próximos 7 días", count: riskCounts.proximo },
    { key: "pendientes", label: "Pendiente futuro", count: riskCounts.pendiente_futuro },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cartera</h1>
        <p className="text-sm text-slate-500">
          Estudiantes con saldo por cobrar. Prioriza a quienes están en mora y a
          los que vencen en los próximos 7 días para gestionar el recaudo.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total por cobrar"
          value={formatUsd(kpis.totalPendingUsd)}
          tone="slate"
        />
        <KpiCard
          label="Total vencido"
          value={formatUsd(kpis.totalOverdueUsd)}
          tone="rose"
        />
        <KpiCard
          label="Estudiantes en mora"
          value={String(riskCounts.en_mora)}
          tone="rose"
        />
        <KpiCard
          label="Próximos 7 días"
          value={String(riskCounts.proximo)}
          hint={formatUsd(kpis.dueSoonUsd)}
          tone="amber"
        />
        <KpiCard
          label="Pendiente futuro"
          value={String(riskCounts.pendiente_futuro)}
          tone="slate"
        />
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Prioridad de hoy
        </p>
        <div className="flex flex-wrap gap-4">
          <PriorityChip
            label="En mora"
            count={riskCounts.en_mora}
            tone="rose"
          />
          <PriorityChip
            label="Próximos 7 días"
            count={riskCounts.proximo}
            tone="amber"
          />
          <PriorityChip
            label="Pendiente futuro"
            count={riskCounts.pendiente_futuro}
            tone="slate"
          />
        </div>
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
                active ? FILTER_ACTIVE_CLASSES[f.key] : FILTER_INACTIVE_CLASSES
              }`}
            >
              {f.label} ({f.count})
            </Link>
          );
        })}
      </div>

      {visibleSummaries.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {riskCounts.total === 0
            ? "No hay estudiantes con saldo por cobrar. La cartera está al día."
            : "No hay estudiantes en esta categoría."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSummaries.map((s) => {
            const meta = metaByStudent.get(s.studentId);
            if (!meta) return null;
            return (
              <StudentCard key={s.studentId} summary={s} meta={meta} />
            );
          })}
        </div>
      )}
    </div>
  );

  function StudentCard({
    summary,
    meta,
  }: {
    summary: (typeof summaries)[number];
    meta: StudentMeta;
  }) {
    const detail = meta.installments
      .slice()
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return (
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/operaciones/estudiantes/${summary.studentId}`}
                className="text-base font-semibold text-slate-900 hover:underline"
              >
                {meta.studentName}
              </Link>
              <RiskBadge level={summary.riskLevel} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Mentor: {meta.mentor} · Closer: {meta.closer}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Metric
                label="Vencido"
                value={formatUsd(summary.totalOverdueUsd)}
                tone={summary.totalOverdueUsd > 0 ? "rose" : "slate"}
              />
              <Metric
                label="Por cobrar"
                value={formatUsd(summary.totalPendingUsd)}
                tone="slate"
              />
              <Metric
                label="Cuotas vencidas"
                value={String(summary.overdueCount)}
                tone={summary.overdueCount > 0 ? "rose" : "slate"}
              />
              <Metric
                label="Cuotas pendientes"
                value={String(summary.outstandingCount)}
                tone="slate"
              />
              <Metric
                label="Próxima cuota"
                value={
                  summary.nextDueDate
                    ? `${formatDate(summary.nextDueDate)} · ${formatUsd(summary.nextDueAmount)}`
                    : "Sin cuotas futuras"
                }
                tone="slate"
              />
            </div>
          </div>
          <div className="shrink-0">
            <Link
              href={`/operaciones/estudiantes/${summary.studentId}?tab=pagos`}
              className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ${
                summary.overdueCount > 0
                  ? "border border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {summary.overdueCount > 0 ? "Registrar pago" : "Ver pagos"}
            </Link>
          </div>
        </div>

        <details className="border-t border-slate-100 px-4 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
            Ver cuotas ({detail.length})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-4">Cuota</th>
                  <th className="py-1 pr-4">Vence</th>
                  <th className="py-1 pr-4">Pendiente</th>
                  <th className="py-1 pr-4">Estado</th>
                  <th className="py-1 pr-4">Atraso / faltan</th>
                  <th className="py-1 pr-4">Producto</th>
                  <th className="py-1 pr-4">Cuenta receptora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5 pr-4 text-slate-600">#{c.installmentNumber}</td>
                    <td className="py-1.5 pr-4 text-slate-600">{formatDate(c.dueDate)}</td>
                    <td className="py-1.5 pr-4 font-medium text-slate-900">
                      {formatUsd(c.pendingUsd)}
                    </td>
                    <td className="py-1.5 pr-4">
                      <StatusBadge status={c.displayStatus} />
                    </td>
                    <td className="py-1.5 pr-4">
                      <DaysCell days={c.days} />
                    </td>
                    <td className="py-1.5 pr-4 text-slate-600">{c.productName}</td>
                    <td className="py-1.5 pr-4 text-slate-600">
                      {c.paymentAccount ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    );
  }
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

function PriorityChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "rose" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    rose: "text-rose-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
  };
  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-2xl font-bold ${tones[tone]}`}>{count}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "rose" | "slate";
}) {
  const valueTone: Record<string, string> = {
    rose: "text-rose-700",
    slate: "text-slate-900",
  };
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`font-semibold ${valueTone[tone]}`}>{value}</p>
    </div>
  );
}

function RiskBadge({ level }: { level: CarteraRiskLevel }) {
  const map: Record<CarteraRiskLevel, [string, string]> = {
    en_mora: ["En mora", "bg-rose-100 text-rose-700"],
    proximo: ["Próximo", "bg-amber-100 text-amber-700"],
    pendiente_futuro: ["Pendiente futuro", "bg-slate-100 text-slate-700"],
  };
  const [label, className] = map[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
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
