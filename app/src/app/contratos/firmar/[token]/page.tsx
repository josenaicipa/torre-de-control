import { prisma } from "@/lib/prisma";
import {
  buildContractView,
  contractBulletText,
  formatContractDate,
  formatContractUsd,
  isContractBullet,
} from "@/lib/operaciones-contract-template";
import {
  buildContractInputFromData,
  contractEnrollmentSelect,
} from "@/lib/operaciones-contract";
import { SignForm } from "./sign-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
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

// Renderiza los párrafos de una cláusula agrupando viñetas consecutivas en una
// lista <ul> con bullets reales; el resto se renderiza como párrafos normales.
function SectionParagraphs({ paragraphs }: { paragraphs: string[] }) {
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (key: string) => {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer;
    bulletBuffer = [];
    blocks.push(
      <ul key={key} className="ml-5 list-disc space-y-1">
        {items.map((text, idx) => (
          <li key={idx}>{text}</li>
        ))}
      </ul>,
    );
  };

  paragraphs.forEach((paragraph, idx) => {
    if (isContractBullet(paragraph)) {
      bulletBuffer.push(contractBulletText(paragraph));
      return;
    }
    flushBullets(`ul-${idx}`);
    blocks.push(<p key={`p-${idx}`}>{paragraph}</p>);
  });
  flushBullets("ul-end");

  return <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{blocks}</div>;
}

export default async function FirmarContratoPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) return <InvalidLink />;

  const enrollment = await prisma.studentProductEnrollment.findUnique({
    where: { contractSignatureToken: token },
    select: contractEnrollmentSelect,
  });

  if (!enrollment) return <InvalidLink />;

  const isSigned =
    enrollment.contractStatus === "SIGNED" ||
    enrollment.contractStatus === "PENDING_APPROVAL" ||
    enrollment.contractStatus === "APPROVED";

  const clientName =
    enrollment.student.legalName?.trim() || enrollment.student.fullName;

  const input = buildContractInputFromData(
    enrollment,
    enrollment.contractSignedAt,
  );
  const contract = buildContractView(input);

  const agreementDateLabel = contract.signature.agreementDateLabel;
  const signatureImage = enrollment.contractStudentSignatureImage;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="border-b border-slate-200 pb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {contract.subtitle}
          </p>
          <h1 className="mt-1 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
            {contract.title}
          </h1>
        </header>

        <section className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Reunidos</h2>
            <p className="mt-1">{contract.parties}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Exponen</h2>
            <p className="mt-1">{contract.exponen}</p>
          </div>
        </section>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <Detail label="Estudiante (EL CLIENTE)" value={clientName} />
          <Detail label="Correo" value={enrollment.student.email} />
          <Detail label="Documento" value={input.clientDocument ?? "—"} />
          <Detail label="Domicilio" value={input.clientAddress ?? "—"} />
          <Detail label="Producto" value={input.productName} />
          <Detail label="Fecha de acuerdo" value={agreementDateLabel} />
          <Detail label="Valor total" value={formatContractUsd(input.totalAmountUsd)} />
          <Detail label="Pago inicial" value={formatContractUsd(input.initialPaymentUsd)} />
          <Detail label="Saldo pendiente" value={formatContractUsd(input.balanceUsd)} />
          <Detail label="Fecha de finalización" value={contract.signature.endDateLabel} />
        </dl>

        {input.installments.length > 0 && (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Calendario de pagos
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {input.installments.map((cuota) => (
                <li key={cuota.number} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">Cuota {cuota.number}</span>
                  <span>· vence {formatContractDate(cuota.dueDate)}</span>
                  <span>· {formatContractUsd(cuota.amountUsd)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-7 space-y-6">
          {contract.sections.map((section) => (
            <section key={section.id}>
              <h2 className="text-sm font-semibold text-slate-900">{section.heading}</h2>
              <SectionParagraphs paragraphs={section.paragraphs} />
            </section>
          ))}
        </div>

        <div className="mt-8 grid gap-4 border-t border-slate-200 pt-5 text-sm text-slate-700 sm:grid-cols-2">
          <p>
            <span className="block text-xs text-slate-500">Fecha de acuerdo</span>
            <span className="font-medium">{contract.signature.agreementDateLabel}</span>
          </p>
          <p>
            <span className="block text-xs text-slate-500">Fecha de finalización del acuerdo</span>
            <span className="font-medium">{contract.signature.endDateLabel}</span>
          </p>
          <p>
            <span className="block text-xs text-slate-500">Firma del estudiante</span>
            <span className="font-medium">{contract.signature.clientName}</span>
          </p>
          <p>
            <span className="block text-xs text-slate-500">Firma del CEO</span>
            <span className="font-medium">{contract.signature.ceoName}</span>
          </p>
        </div>

        {isSigned ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <p className="font-semibold">Contrato firmado</p>
            {enrollment.contractSignerName && (
              <p className="mt-1">Firmante: {enrollment.contractSignerName}</p>
            )}
            {enrollment.contractSignedAt && (
              <p className="mt-1">
                Fecha de firma: {formatContractDate(isoDate(enrollment.contractSignedAt))}
              </p>
            )}
            {signatureImage ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-emerald-600">Firma manuscrita</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureImage}
                  alt={`Firma de ${enrollment.contractSignerName ?? clientName}`}
                  className="mt-1 max-h-28 w-auto rounded bg-white object-contain"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-600">
                Firma registrada electrónicamente (sin imagen manuscrita adjunta).
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-md bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
              Declaro que he leído, entiendo y acepto en su totalidad las cláusulas del
              presente Contrato de Prestación de Servicios de Consultoría «Unlocked Academy»,
              incluyendo el valor total, el pago inicial y el calendario de pagos descritos.
              Esta firma electrónica confirma mi voluntad de obligarme conforme a sus términos.
            </div>
            <SignForm token={token} defaultName={clientName} />
          </>
        )}
      </article>
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
