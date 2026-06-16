import { prisma } from "@/lib/prisma";
import { SignForm } from "./sign-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

function formatUsd(value: unknown): string {
  const num = Number(value ?? 0);
  return `USD $${(Number.isFinite(num) ? num : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function InvalidLink() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-rose-700">Enlace de firma inválido</h1>
        <p className="mt-2 text-sm text-rose-600">
          Este enlace de firma no existe o ya no está disponible. Solicita uno nuevo al
          equipo de Unlocked Academy.
        </p>
      </div>
    </main>
  );
}

export default async function FirmarContratoPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) return <InvalidLink />;

  const enrollment = await prisma.studentProductEnrollment.findUnique({
    where: { contractSignatureToken: token },
    select: {
      id: true,
      totalAmountUsd: true,
      initialPaymentUsd: true,
      balanceUsd: true,
      installmentCount: true,
      currency: true,
      contractStatus: true,
      contractSignedAt: true,
      contractSignerName: true,
      student: { select: { fullName: true, email: true } },
      product: { select: { name: true } },
      paymentSchedules: {
        orderBy: { installmentNumber: "asc" },
        select: {
          id: true,
          installmentNumber: true,
          amountDue: true,
          currency: true,
          dueDate: true,
        },
      },
    },
  });

  if (!enrollment) return <InvalidLink />;

  const isSigned =
    enrollment.contractStatus === "SIGNED" ||
    enrollment.contractStatus === "PENDING_APPROVAL" ||
    enrollment.contractStatus === "APPROVED";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Unlocked Academy · Contrato de prueba
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Contrato de inscripción — {enrollment.product.name}
        </h1>

        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Este es un contrato de prueba interno de Torre de Control. Sirve para validar el
          flujo de firma y aprobación. Más adelante será reemplazado por el contrato oficial.
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Detail label="Estudiante" value={enrollment.student.fullName} />
          <Detail label="Correo" value={enrollment.student.email} />
          <Detail label="Producto" value={enrollment.product.name} />
          <Detail label="Fecha" value={today} />
          <Detail label="Valor total" value={formatUsd(enrollment.totalAmountUsd)} />
          <Detail label="Pago inicial" value={formatUsd(enrollment.initialPaymentUsd ?? 0)} />
          <Detail label="Saldo" value={formatUsd(enrollment.balanceUsd ?? 0)} />
          <Detail
            label="Cuotas"
            value={enrollment.installmentCount ? String(enrollment.installmentCount) : "—"}
          />
        </dl>

        {enrollment.paymentSchedules.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase text-slate-500">Plan de cuotas</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {enrollment.paymentSchedules.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="font-medium">Cuota {s.installmentNumber}</span>
                  <span>· vence {s.dueDate.toISOString().slice(0, 10)}</span>
                  <span>
                    · {s.currency} $
                    {Number(s.amountDue).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 rounded-md bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700">
          Declaro que conozco y acepto las condiciones de inscripción al producto indicado,
          incluyendo el valor total, el pago inicial y el plan de pagos descrito. Esta firma
          electrónica de prueba confirma mi voluntad de continuar con el proceso.
        </div>

        {isSigned ? (
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <p className="font-semibold">Contrato firmado</p>
            {enrollment.contractSignerName && (
              <p className="mt-1">Firmante: {enrollment.contractSignerName}</p>
            )}
            {enrollment.contractSignedAt && (
              <p className="mt-1">
                Fecha de firma: {enrollment.contractSignedAt.toISOString().slice(0, 10)}
              </p>
            )}
          </div>
        ) : (
          <SignForm token={token} defaultName={enrollment.student.fullName} />
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
