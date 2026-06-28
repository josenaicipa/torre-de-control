"use client";

import { useMemo, useState } from "react";

import {
  COUNTRIES,
  DOCUMENT_TYPES,
  subdivisionsForCountry,
} from "@/lib/legal-locations";

export interface OnboardingInitial {
  nombre: string;
  apellidos: string;
  whatsapp: string;
  correoPrincipal: string;
  correoSecundario: string;
  direccionPostal: string;
  ciudad: string;
  region: string;
  pais: string;
  nombreLegal: string;
  tipoDocumento: string;
  numeroDocumento: string;
  tiendaActiva: string;
  paisOpera: string;
  nombreTienda: string;
  facturacionActual: string;
  plataformaLogistica: string;
  comoNosConociste: string;
  otroMedio: string;
  porQueMundoDigital: string;
  tiempoSemanal: string;
  presupuestoInicial: string;
  queEsperasLograr: string;
}

const PAISES_OPERA = [
  "Argentina",
  "Brazil",
  "Colombia",
  "Costa Rica",
  "Chile",
  "Ecuador",
  "España",
  "Estados Unidos",
  "Guatemala",
  "Mexico",
  "Panama",
  "Paraguay",
  "Peru",
  "Republica Dominicana",
  "Venezuela",
  "Otro",
];

const PLATAFORMAS_LOGISTICAS = ["Dropi", "Effi", "Otra"];

const COMO_NOS_CONOCISTE = [
  "Redes Jose",
  "PodCast",
  "Publicidad Facebook",
  "Publicidad TikTok",
  "SmartBeemo",
  "Otro Medio",
];

export function OnboardingForm({
  token,
  initial,
}: {
  token: string;
  initial: OnboardingInitial;
}) {
  const [form, setForm] = useState<OnboardingInitial>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const tieneTienda = form.tiendaActiva === "Si";

  const regionOptions = useMemo(
    () => subdivisionsForCountry(form.pais),
    [form.pais],
  );

  const mostrarOtroMedio =
    form.comoNosConociste === "Otro Medio" || form.comoNosConociste === "Otro";

  function set<K extends keyof OnboardingInitial>(
    key: K,
    value: OnboardingInitial[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPaisChange(value: string) {
    setForm((prev) => ({
      ...prev,
      pais: value,
      // Al cambiar de país, la región anterior puede no existir en el nuevo
      // catálogo: la limpiamos para no guardar un departamento incoherente.
      ...(subdivisionsForCountry(value).includes(prev.region)
        ? {}
        : { region: "" }),
    }));
  }

  function onComoNosConocisteChange(value: string) {
    const esOtro = value === "Otro Medio" || value === "Otro";
    setForm((prev) => ({
      ...prev,
      comoNosConociste: value,
      ...(esOtro ? {} : { otroMedio: "" }),
    }));
  }

  function onTiendaActivaChange(value: string) {
    setForm((prev) => ({
      ...prev,
      tiendaActiva: value,
      // Al dejar de tener tienda activa, limpiamos los datos de tienda para no
      // guardar información vieja e invisible.
      ...(value === "Si"
        ? {}
        : {
            paisOpera: "",
            nombreTienda: "",
            facturacionActual: "",
            plataformaLogistica: "",
          }),
    }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/onboarding/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? "No se pudo guardar el formulario");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Error de red al guardar el formulario");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="ob-banner is-success" style={{ marginTop: "1.5rem" }}>
        <CheckCircleIcon />
        <div>
          <h2>¡Listo! Recibimos tu información</h2>
          <p>
            El equipo de Unlocked Academy continuará con tu proceso de
            acompañamiento. Pronto tendrás noticias nuestras.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="ob-form">
      {error && (
        <div className="ob-banner is-error">
          <AlertIcon />
          <div>
            <h2>No pudimos enviar tu formulario</h2>
            <p>{error}</p>
          </div>
        </div>
      )}

      <Section step={1} title="Datos personales" desc="Para identificarte y contactarte.">
        <div className="ob-grid cols-2">
          <Field label="Nombre">
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              className="ob-input"
              placeholder="Tu nombre"
            />
          </Field>
          <Field label="Apellidos">
            <input
              type="text"
              value={form.apellidos}
              onChange={(e) => set("apellidos", e.target.value)}
              className="ob-input"
              placeholder="Tus apellidos"
            />
          </Field>
          <Field label="Whatsapp" required>
            <input
              type="text"
              required
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              className="ob-input"
              placeholder="+57 300 000 0000"
            />
          </Field>
          <Field label="Correo principal" required>
            <input
              type="email"
              required
              value={form.correoPrincipal}
              onChange={(e) => set("correoPrincipal", e.target.value)}
              className="ob-input"
              placeholder="tucorreo@email.com"
            />
          </Field>
          <Field label="Correo secundario" className="span-2">
            <input
              type="email"
              value={form.correoSecundario}
              onChange={(e) => set("correoSecundario", e.target.value)}
              className="ob-input"
              placeholder="Opcional"
            />
          </Field>
        </div>
      </Section>

      <Section
        step={2}
        title="Datos legales"
        desc="Necesarios para preparar tu contrato."
      >
        <div className="ob-grid cols-2">
          <Field label="Nombre legal" required className="span-2">
            <input
              type="text"
              required
              value={form.nombreLegal}
              onChange={(e) => set("nombreLegal", e.target.value)}
              className="ob-input"
            />
          </Field>
          <Field label="Tipo de documento" required>
            <select
              required
              value={form.tipoDocumento}
              onChange={(e) => set("tipoDocumento", e.target.value)}
              className="ob-input"
            >
              <option value="">Selecciona…</option>
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Número de documento" required>
            <input
              type="text"
              required
              value={form.numeroDocumento}
              onChange={(e) => set("numeroDocumento", e.target.value)}
              className="ob-input"
            />
          </Field>
          <Field label="País" required>
            <select
              required
              value={form.pais}
              onChange={(e) => onPaisChange(e.target.value)}
              className="ob-input"
            >
              <option value="">Selecciona…</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Región / departamento / estado" required>
            {regionOptions.length > 0 ? (
              <select
                required
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className="ob-input"
              >
                <option value="">Selecciona…</option>
                {regionOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                required
                value={form.region}
                onChange={(e) => set("region", e.target.value)}
                className="ob-input"
              />
            )}
          </Field>
          <Field label="Ciudad" required>
            <input
              type="text"
              required
              value={form.ciudad}
              onChange={(e) => set("ciudad", e.target.value)}
              className="ob-input"
            />
          </Field>
          <Field label="Dirección postal" required className="span-2">
            <input
              type="text"
              required
              value={form.direccionPostal}
              onChange={(e) => set("direccionPostal", e.target.value)}
              className="ob-input"
            />
          </Field>
        </div>
      </Section>

      <Section
        step={3}
        title="Tu negocio"
        desc="Cuéntanos en qué punto estás hoy."
      >
        <div className="ob-grid">
          <Field label="¿Tienes tienda activa?" required>
            <select
              required
              value={form.tiendaActiva}
              onChange={(e) => onTiendaActivaChange(e.target.value)}
              className="ob-input"
            >
              <option value="">Selecciona…</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </Field>

          {tieneTienda && (
            <div className="ob-conditional">
              <div className="ob-conditional-head">
                <StoreIcon />
                Datos de tu tienda
              </div>
              <div className="ob-grid cols-2">
                <Field label="País en el que opera" required>
                  <select
                    required={tieneTienda}
                    value={form.paisOpera}
                    onChange={(e) => set("paisOpera", e.target.value)}
                    className="ob-input"
                  >
                    <option value="">Selecciona…</option>
                    {PAISES_OPERA.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nombre de la tienda" required>
                  <input
                    type="text"
                    required={tieneTienda}
                    value={form.nombreTienda}
                    onChange={(e) => set("nombreTienda", e.target.value)}
                    className="ob-input"
                  />
                </Field>
                <Field label="$ Facturación actual" required>
                  <input
                    type="text"
                    required={tieneTienda}
                    value={form.facturacionActual}
                    onChange={(e) => set("facturacionActual", e.target.value)}
                    className="ob-input"
                    placeholder="Ej: USD 5.000 / mes"
                  />
                </Field>
                <Field label="¿Con qué plataforma logística trabajas?" required>
                  <select
                    required={tieneTienda}
                    value={form.plataformaLogistica}
                    onChange={(e) => set("plataformaLogistica", e.target.value)}
                    className="ob-input"
                  >
                    <option value="">Selecciona…</option>
                    {PLATAFORMAS_LOGISTICAS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section
        step={4}
        title="Cuéntanos más"
        desc="Esto nos ayuda a personalizar tu acompañamiento."
      >
        <div className="ob-grid">
          <Field label="¿Cómo nos conociste?" required>
            <select
              required
              value={form.comoNosConociste}
              onChange={(e) => onComoNosConocisteChange(e.target.value)}
              className="ob-input"
            >
              <option value="">Selecciona…</option>
              {COMO_NOS_CONOCISTE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {mostrarOtroMedio && (
            <Field label="Otro medio" required>
              <input
                type="text"
                required
                value={form.otroMedio}
                onChange={(e) => set("otroMedio", e.target.value)}
                className="ob-input"
                placeholder="Cuéntanos cómo nos conociste"
              />
            </Field>
          )}
          <Field
            label="¿Por qué quieres hacer parte del mundo digital? (Ingresos extra, negocio a largo plazo, aprendizaje, etc.)"
            required
          >
            <textarea
              required
              rows={3}
              value={form.porQueMundoDigital}
              onChange={(e) => set("porQueMundoDigital", e.target.value)}
              className="ob-input"
            />
          </Field>
          <Field label="Tiempo semanal que puedes dedicar" required>
            <input
              type="text"
              required
              value={form.tiempoSemanal}
              onChange={(e) => set("tiempoSemanal", e.target.value)}
              className="ob-input"
              placeholder="Ej: 10 horas"
            />
          </Field>
          <Field
            label="¿Tienes un presupuesto inicial para invertir en publicidad y herramientas? (Sí/No, ¿Cuánto?)"
            required
          >
            <input
              type="text"
              required
              value={form.presupuestoInicial}
              onChange={(e) => set("presupuestoInicial", e.target.value)}
              className="ob-input"
            />
          </Field>
          <Field label="¿Qué esperas lograr?" required>
            <textarea
              required
              rows={3}
              value={form.queEsperasLograr}
              onChange={(e) => set("queEsperasLograr", e.target.value)}
              className="ob-input"
            />
          </Field>
        </div>
      </Section>

      <div className="ob-submit-bar">
        <button type="submit" disabled={submitting} className="ob-submit">
          {submitting ? "Enviando…" : "Enviar información"}
        </button>
        <p className="ob-submit-note">
          Tus datos se usan solo para tu proceso con Unlocked Academy.
        </p>
      </div>
    </form>
  );
}

function Section({
  step,
  title,
  desc,
  children,
}: {
  step: number;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ob-section">
      <div className="ob-section-head">
        <span className="ob-step">{step}</span>
        <div>
          <h2 className="ob-section-title">{title}</h2>
          {desc && <p className="ob-section-desc">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`ob-field${className ? ` ${className}` : ""}`}>
      <span className="ob-field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
    </label>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l1-5h16l1 5" />
      <path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
    </svg>
  );
}
