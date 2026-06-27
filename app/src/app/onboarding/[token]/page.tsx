import { prisma } from "@/lib/prisma";
import { OnboardingForm, type OnboardingInitial } from "./onboarding-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

function InvalidLink() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-rose-700">
          Enlace de onboarding inválido
        </h1>
        <p className="mt-2 text-sm text-rose-600">
          Este enlace no existe o ya no está disponible. Solicita uno nuevo al
          equipo de Unlocked Academy.
        </p>
      </div>
    </main>
  );
}

export default async function OnboardingPage({ params }: PageProps) {
  const { token } = await params;
  if (!token) return <InvalidLink />;

  const student = await prisma.student.findUnique({
    where: { onboardingToken: token },
    select: {
      fullName: true,
      email: true,
      phone: true,
      legalName: true,
      documentType: true,
      documentNumber: true,
      legalAddress: true,
      legalCity: true,
      legalState: true,
      legalCountry: true,
      onboardingResponses: true,
      onboardingCompletedAt: true,
    },
  });

  if (!student) return <InvalidLink />;

  const saved = (student.onboardingResponses ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string =>
    typeof value === "string" ? value : "";

  const initial: OnboardingInitial = {
    nombre: student.fullName ?? "",
    apellidos: "",
    whatsapp: student.phone ?? "",
    correoPrincipal: student.email ?? "",
    correoSecundario: str(saved.correoSecundario),
    direccionPostal: student.legalAddress ?? "",
    ciudad: student.legalCity ?? "",
    region: student.legalState ?? "",
    pais: student.legalCountry ?? "",
    nombreLegal: student.legalName ?? "",
    tipoDocumento: student.documentType ?? "",
    numeroDocumento: student.documentNumber ?? "",
    tiendaActiva: str(saved.tiendaActiva),
    paisOpera: str(saved.paisOpera),
    nombreTienda: str(saved.nombreTienda),
    facturacionActual: str(saved.facturacionActual),
    plataformaLogistica: str(saved.plataformaLogistica),
    comoNosConociste: str(saved.comoNosConociste),
    otroMedio: str(saved.otroMedio),
    porQueMundoDigital: str(saved.porQueMundoDigital),
    tiempoSemanal: str(saved.tiempoSemanal),
    presupuestoInicial: str(saved.presupuestoInicial),
    queEsperasLograr: str(saved.queEsperasLograr),
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Unlocked Academy
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Completa tu información
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Necesitamos estos datos para activar tu acompañamiento. Los campos con
          <span className="font-medium text-rose-600"> *</span> son obligatorios.
        </p>
      </header>

      {student.onboardingCompletedAt && (
        <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Ya completaste este formulario. Puedes actualizar tus datos y volver a
          enviarlo si es necesario.
        </div>
      )}

      <OnboardingForm token={token} initial={initial} />
    </main>
  );
}
