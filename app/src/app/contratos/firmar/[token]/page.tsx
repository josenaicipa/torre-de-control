import { prisma } from "@/lib/prisma";
import {
  buildContractView,
  buildPartiesSegments,
  contractBulletText,
  formatContractDate,
  formatContractUsd,
  isContractBullet,
  parseContractSegments,
} from "@/lib/operaciones-contract-template";
import {
  buildContractInputFromData,
  contractEnrollmentSelect,
  parseManualClausesSnapshot,
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

// Renderiza un texto resaltando en negrita los fragmentos marcados (montos y
// fechas variables del párrafo de pagos) mediante <strong>.
function InlineText({ text }: { text: string }) {
  const segments = parseContractSegments(text);
  return (
    <>
      {segments.map((segment, idx) =>
        segment.bold ? (
          <strong key={idx} className="font-semibold text-slate-900">
            {segment.text}
          </strong>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </>
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
          <li key={idx}>
            <InlineText text={text} />
          </li>
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
    blocks.push(
      <p key={`p-${idx}`}>
        <InlineText text={paragraph} />
      </p>,
    );
  });
  flushBullets("ul-end");

  return <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">{blocks}</div>;
}

// Renderiza la cláusula "Reunidos" resaltando en negrita los datos variables
// (empresa, EIN, dirección, nombre del cliente, documento y domicilio).
function PartiesText({ input }: { input: Parameters<typeof buildPartiesSegments>[0] }) {
  const segments = buildPartiesSegments(input);
  return (
    <p className="mt-1">
      {segments.map((segment, idx) =>
        segment.bold ? (
          <strong key={idx} className="font-semibold text-slate-900">
            {segment.text}
          </strong>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </p>
  );
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

  const manualClauses =
    parseManualClausesSnapshot(enrollment.contractManualClausesSnapshot) ?? [];
  const input = buildContractInputFromData(
    enrollment,
    enrollment.contractSignedAt,
    manualClauses,
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

        {isSigned ? (
          <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
            <p className="text-base font-bold text-emerald-900">Contrato firmado</p>
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
                <p className="text-xs font-medium text-emerald-700">Firma manuscrita</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signatureImage}
                  alt={`Firma de ${enrollment.contractSignerName ?? clientName}`}
                  className="mt-1 max-h-28 w-auto rounded bg-white object-contain"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-emerald-700">
                Firma registrada electrónicamente (sin imagen manuscrita adjunta).
              </p>
            )}
          </div>
        ) : (
          <section className="mt-6 rounded-lg border-2 border-indigo-300 bg-indigo-50 p-5 shadow-sm">
            <h2 className="text-base font-bold text-indigo-900">
              Paso final: sube la foto de tu firma y firma el contrato
            </h2>
            <p className="mt-1 text-sm text-indigo-800">
              Revisa los datos y el contrato más abajo. Para completar tu inscripción,
              sube una foto clara de tu firma manuscrita y confirma la firma electrónica.
            </p>
            <div className="mt-4 rounded-md bg-white/70 px-4 py-3 text-sm leading-relaxed text-slate-700">
              Declaro que he leído, entiendo y acepto en su totalidad las cláusulas del
              presente Contrato de Prestación de Servicios de Consultoría «Unlocked Academy»,
              incluyendo el valor total, el pago inicial y el calendario de pagos descritos.
              Esta firma electrónica confirma mi voluntad de obligarme conforme a sus términos.
            </div>
            <SignForm token={token} defaultName={clientName} />
          </section>
        )}

        <section className="mt-6 space-y-4 text-sm leading-relaxed text-slate-700">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Reunidos</h2>
            <PartiesText input={input} />
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
