"use client";

import { useState } from "react";

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

const COMO_NOS_CONOCISTE = [
  "Redes Jose",
  "PodCast",
  "Publicidad Facebook",
  "Publicidad TikTok",
  "SmartBeemo",
  "Otro Medio",
];

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900";

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

  function set<K extends keyof OnboardingInitial>(
    key: K,
    value: OnboardingInitial[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      <div className="mt-8 rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">
          ¡Gracias! Recibimos tu información
        </h2>
        <p className="mt-2 text-sm text-emerald-700">
          El equipo de Unlocked Academy continuará con tu proceso.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Section title="Datos personales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Apellidos">
            <input
              type="text"
              value={form.apellidos}
              onChange={(e) => set("apellidos", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Whatsapp" required>
            <input
              type="text"
              required
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Correo Principal" required>
            <input
              type="email"
              required
              value={form.correoPrincipal}
              onChange={(e) => set("correoPrincipal", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Correo Secundario">
            <input
              type="email"
              value={form.correoSecundario}
              onChange={(e) => set("correoSecundario", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Datos legales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dirección postal" required>
            <input
              type="text"
              required
              value={form.direccionPostal}
              onChange={(e) => set("direccionPostal", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ciudad" required>
            <input
              type="text"
              required
              value={form.ciudad}
              onChange={(e) => set("ciudad", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Región / provincia / estado" required>
            <input
              type="text"
              required
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="País" required>
            <input
              type="text"
              required
              value={form.pais}
              onChange={(e) => set("pais", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Nombre legal" required>
            <input
              type="text"
              required
              value={form.nombreLegal}
              onChange={(e) => set("nombreLegal", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Tipo de documento" required>
            <input
              type="text"
              required
              value={form.tipoDocumento}
              onChange={(e) => set("tipoDocumento", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Número de documento" required>
            <input
              type="text"
              required
              value={form.numeroDocumento}
              onChange={(e) => set("numeroDocumento", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Tu negocio">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="¿Tienes Tienda Activa?" required>
            <select
              required
              value={form.tiendaActiva}
              onChange={(e) => set("tiendaActiva", e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona…</option>
              <option value="Si">Sí</option>
              <option value="No">No</option>
            </select>
          </Field>
          <Field label="País en el que Opera" required>
            <select
              required
              value={form.paisOpera}
              onChange={(e) => set("paisOpera", e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona…</option>
              {PAISES_OPERA.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre de la Tienda">
            <input
              type="text"
              value={form.nombreTienda}
              onChange={(e) => set("nombreTienda", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="$ Facturación Actual">
            <input
              type="text"
              value={form.facturacionActual}
              onChange={(e) => set("facturacionActual", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Plataforma logística">
            <input
              type="text"
              value={form.plataformaLogistica}
              onChange={(e) => set("plataformaLogistica", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="Cuéntanos más">
        <div className="grid gap-4">
          <Field label="¿Cómo nos conociste?" required>
            <select
              required
              value={form.comoNosConociste}
              onChange={(e) => set("comoNosConociste", e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona…</option>
              {COMO_NOS_CONOCISTE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Otro medio">
            <input
              type="text"
              value={form.otroMedio}
              onChange={(e) => set("otroMedio", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="¿Por qué el mundo digital?" required>
            <textarea
              required
              rows={3}
              value={form.porQueMundoDigital}
              onChange={(e) => set("porQueMundoDigital", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Tiempo semanal que puedes dedicar" required>
            <input
              type="text"
              required
              value={form.tiempoSemanal}
              onChange={(e) => set("tiempoSemanal", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Presupuesto inicial" required>
            <input
              type="text"
              required
              value={form.presupuestoInicial}
              onChange={(e) => set("presupuestoInicial", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="¿Qué esperas lograr?" required>
            <textarea
              required
              rows={3}
              value={form.queEsperasLograr}
              onChange={(e) => set("queEsperasLograr", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold !text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Enviando…" : "Enviar información"}
      </button>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
