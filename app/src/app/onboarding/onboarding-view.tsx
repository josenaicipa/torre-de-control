import { prisma } from "@/lib/prisma";
import { OnboardingForm, type OnboardingInitial } from "./onboarding-form";

export function InvalidLink() {
  return (
    <main className="onboarding-surface">
      <div className="onboarding-shell">
        <div className="ob-banner is-error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <h2>Enlace de onboarding inválido</h2>
            <p>
              Este enlace no existe o ya no está disponible. Solicita uno nuevo
              al equipo de Unlocked Academy.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// Pantalla amable cuando se abre /formularioonboarding sin token. No es un
// error: el formulario simplemente necesita el enlace personal de cada
// estudiante (generado desde su ficha en Torre).
export function MissingLink() {
  return (
    <main className="onboarding-surface">
      <div className="onboarding-shell">
        <header className="ob-hero">
          <span className="ob-eyebrow">Unlocked Academy</span>
          <h1 className="ob-title">Este formulario usa un enlace personal</h1>
          <p className="ob-subtitle">
            Cada estudiante tiene su propio enlace de onboarding para que
            podamos guardar tu información de forma segura. Genera o copia tu
            enlace desde la ficha del estudiante en Torre y ábrelo para
            completar tus datos.
          </p>
          <div className="ob-benefits">
            <span className="ob-benefit">
              <ShieldIcon />
              Datos seguros
            </span>
            <span className="ob-benefit">
              <ClockIcon />
              2 minutos
            </span>
            <span className="ob-benefit">
              <SparkIcon />
              Acompañamiento 1:1
            </span>
          </div>
        </header>

        <div className="ob-banner is-info" style={{ marginTop: "1rem" }}>
          <InfoIcon />
          <div>
            <h2>¿No tienes tu enlace?</h2>
            <p>
              Escríbele al equipo de Unlocked Academy y te compartimos tu enlace
              personalizado para empezar.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// Carga el estudiante por token y renderiza el formulario de onboarding. Es la
// vista compartida entre la ruta legacy /onboarding/[token] y la ruta pública
// /formularioonboarding?token=...
export async function OnboardingView({ token }: { token?: string }) {
  if (!token) return <MissingLink />;

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

  const firstName = (student.fullName ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <main className="onboarding-surface">
      <div className="onboarding-shell">
        <header className="ob-hero">
          <span className="ob-eyebrow">Unlocked Academy</span>
          <h1 className="ob-title">
            {firstName ? (
              <>
                Hola <span className="ob-name">{firstName}</span>, completemos tu
                información
              </>
            ) : (
              "Completa tu información"
            )}
          </h1>
          <p className="ob-subtitle">
            Estos datos nos permiten activar tu acompañamiento y preparar tu
            contrato. Te toma solo un par de minutos.
          </p>
          <div className="ob-benefits">
            <span className="ob-benefit">
              <ShieldIcon />
              Datos seguros
            </span>
            <span className="ob-benefit">
              <ClockIcon />
              2 minutos
            </span>
            <span className="ob-benefit">
              <SparkIcon />
              Acompañamiento 1:1
            </span>
          </div>
        </header>

        {student.onboardingCompletedAt && (
          <div className="ob-banner is-info" style={{ marginTop: "1rem" }}>
            <InfoIcon />
            <div>
              <h2>Ya completaste este formulario</h2>
              <p>
                Puedes actualizar tus datos y volver a enviarlo si necesitas
                cambiar algo.
              </p>
            </div>
          </div>
        )}

        <OnboardingForm token={token} initial={initial} />
      </div>
    </main>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l3 3m8 8l3 3M5 19l3-3m8-8l3-3" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
