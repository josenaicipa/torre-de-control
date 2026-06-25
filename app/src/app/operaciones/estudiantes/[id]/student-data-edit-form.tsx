"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COUNTRIES,
  DOCUMENT_TYPES,
  subdivisionsForCountry,
} from "@/lib/legal-locations";
import { STUDENT_STATUS_LABELS } from "@/lib/student-status";

interface UserOption {
  id: string;
  name: string | null;
  email: string;
  position?: string;
}

// Estados que el schema de actualización (updateStudentSchema) acepta. Se
// mantienen alineados a propósito con studentStatusSchema en
// operaciones-validations.ts; otros labels existen sólo para mostrar datos
// históricos y no deben ofrecerse como opción editable.
const EDITABLE_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "DROPPED",
  "EXTENDED",
  "ACCESS_REVOKED",
] as const;

export interface MemberInitial {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  isPrimaryContact: boolean;
  isContractSigner: boolean;
}

interface MemberRowState {
  fullName: string;
  email: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  isContractSigner: boolean;
}

export interface StudentEditInitial {
  fullName: string;
  email: string;
  phone: string | null;
  startDate: string;
  durationMonths: number;
  mentorUserId: string | null;
  closerUserId: string | null;
  status: string;
  notes: string | null;
  personality: string | null;
  ghlContactId: string | null;
  legalName: string | null;
  documentType: string | null;
  documentNumber: string | null;
  legalAddress: string | null;
  legalCity: string | null;
  legalState: string | null;
  legalCountry: string | null;
}

function buildState(initial: StudentEditInitial) {
  return {
    fullName: initial.fullName ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    startDate: initial.startDate ?? "",
    durationMonths: String(initial.durationMonths ?? ""),
    mentorUserId: initial.mentorUserId ?? "",
    closerUserId: initial.closerUserId ?? "",
    status: initial.status ?? "ACTIVE",
    notes: initial.notes ?? "",
    personality: initial.personality ?? "",
    ghlContactId: initial.ghlContactId ?? "",
    legalName: initial.legalName ?? "",
    documentType: initial.documentType ?? "",
    documentNumber: initial.documentNumber ?? "",
    legalAddress: initial.legalAddress ?? "",
    legalCity: initial.legalCity ?? "",
    legalState: initial.legalState ?? "",
    legalCountry: initial.legalCountry ?? "",
  };
}

function buildMembers(members: MemberInitial[]): MemberRowState[] {
  return members.map((m) => ({
    fullName: m.fullName ?? "",
    email: m.email ?? "",
    phone: m.phone ?? "",
    documentType: m.documentType ?? "",
    documentNumber: m.documentNumber ?? "",
    isContractSigner: m.isContractSigner,
  }));
}

function emptyMemberRow(): MemberRowState {
  return {
    fullName: "",
    email: "",
    phone: "",
    documentType: "",
    documentNumber: "",
    isContractSigner: false,
  };
}

function trimmedOrNull(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function StudentDataEditForm({
  studentId,
  initial,
  mentors,
  closers,
  members,
}: {
  studentId: string;
  initial: StudentEditInitial;
  mentors: UserOption[];
  closers: UserOption[];
  members: MemberInitial[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() => buildState(initial));
  const [memberRows, setMemberRows] = useState<MemberRowState[]>(() =>
    buildMembers(members),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subdivisions = useMemo(
    () => subdivisionsForCountry(state.legalCountry),
    [state.legalCountry],
  );

  function update<K extends keyof typeof state>(key: K, value: string) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  // Al cambiar de país se limpia el departamento/estado para no arrastrar un
  // valor que no pertenece al nuevo catálogo.
  function onChangeCountry(value: string) {
    setState((prev) => ({ ...prev, legalCountry: value, legalState: "" }));
  }

  function updateMember<K extends keyof MemberRowState>(
    index: number,
    key: K,
    value: MemberRowState[K],
  ) {
    setMemberRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  function addMember() {
    setMemberRows((prev) => [...prev, emptyMemberRow()]);
  }

  function removeMember(index: number) {
    setMemberRows((prev) => prev.filter((_, i) => i !== index));
  }

  function openModal() {
    setState(buildState(initial));
    setMemberRows(buildMembers(members));
    setError(null);
    setOpen(true);
  }

  function close() {
    if (saving) return;
    setOpen(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!state.fullName.trim()) {
      setError("El nombre completo es obligatorio");
      return;
    }
    if (!state.email.trim()) {
      setError("El correo es obligatorio");
      return;
    }
    const duration = Number(state.durationMonths);
    if (!Number.isInteger(duration) || duration < 1 || duration > 60) {
      setError("La duración debe ser un número de meses entre 1 y 60");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/operaciones/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: state.fullName.trim(),
          email: state.email.trim(),
          phone: trimmedOrNull(state.phone),
          startDate: state.startDate || undefined,
          durationMonths: duration,
          mentorUserId: state.mentorUserId || null,
          closerUserId: state.closerUserId || null,
          status: state.status,
          notes: trimmedOrNull(state.notes),
          personality: trimmedOrNull(state.personality),
          ghlContactId: trimmedOrNull(state.ghlContactId),
          legalName: trimmedOrNull(state.legalName),
          documentType: trimmedOrNull(state.documentType),
          documentNumber: trimmedOrNull(state.documentNumber),
          legalAddress: trimmedOrNull(state.legalAddress),
          legalCity: trimmedOrNull(state.legalCity),
          legalState: trimmedOrNull(state.legalState),
          legalCountry: trimmedOrNull(state.legalCountry),
          members: memberRows.map((m) => ({
            fullName: m.fullName.trim(),
            email: trimmedOrNull(m.email),
            phone: trimmedOrNull(m.phone),
            documentType: trimmedOrNull(m.documentType),
            documentNumber: trimmedOrNull(m.documentNumber),
            isContractSigner: m.isContractSigner,
          })),
        }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "No se pudieron guardar los datos del estudiante");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Error de red al guardar los datos del estudiante");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={openModal}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Editar datos del estudiante
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={onSubmit}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                Editar datos del estudiante
              </h2>
              <p className="text-xs text-slate-500">
                Completa o corrige los datos básicos y legales del estudiante.
              </p>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
              {error && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Datos básicos
                </h3>
                <Field label="Nombre completo *">
                  <input
                    type="text"
                    value={state.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    maxLength={200}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Correo *">
                    <input
                      type="email"
                      value={state.email}
                      onChange={(e) => update("email", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Teléfono">
                    <input
                      type="text"
                      value={state.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      maxLength={50}
                      placeholder="+573001234567"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fecha de inicio">
                    <input
                      type="date"
                      value={state.startDate}
                      onChange={(e) => update("startDate", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Duración (meses)">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={state.durationMonths}
                      onChange={(e) => update("durationMonths", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Mentor líder">
                    <select
                      value={state.mentorUserId}
                      onChange={(e) => update("mentorUserId", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Sin asignar —</option>
                      {mentors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name ?? m.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Closer">
                    <select
                      value={state.closerUserId}
                      onChange={(e) => update("closerUserId", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Sin asignar —</option>
                      {closers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name ?? c.email}
                          {c.position === "ADMIN" ? " (Admin)" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Estado">
                    <select
                      value={state.status}
                      onChange={(e) => update("status", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {EDITABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STUDENT_STATUS_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ID contacto GHL">
                    <input
                      type="text"
                      value={state.ghlContactId}
                      onChange={(e) => update("ghlContactId", e.target.value)}
                      maxLength={100}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
                <Field label="Personalidad">
                  <input
                    type="text"
                    value={state.personality}
                    onChange={(e) => update("personality", e.target.value)}
                    maxLength={500}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Notas">
                  <textarea
                    value={state.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    maxLength={5000}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </Field>
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Miembros del equipo
                  </h3>
                  <button
                    type="button"
                    onClick={addMember}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    + Agregar miembro
                  </button>
                </div>
                {memberRows.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No hay miembros del equipo.
                  </p>
                ) : (
                  memberRows.map((member, index) => (
                    <div
                      key={index}
                      className="space-y-3 rounded-md border border-slate-200 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">
                          Miembro {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeMember(index)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700"
                        >
                          Eliminar
                        </button>
                      </div>
                      <Field label="Nombre completo">
                        <input
                          type="text"
                          value={member.fullName}
                          onChange={(e) =>
                            updateMember(index, "fullName", e.target.value)
                          }
                          maxLength={200}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Correo">
                          <input
                            type="email"
                            value={member.email}
                            onChange={(e) =>
                              updateMember(index, "email", e.target.value)
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </Field>
                        <Field label="Teléfono">
                          <input
                            type="text"
                            value={member.phone}
                            onChange={(e) =>
                              updateMember(index, "phone", e.target.value)
                            }
                            maxLength={50}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </Field>
                        <Field label="Tipo de documento">
                          <select
                            value={member.documentType}
                            onChange={(e) =>
                              updateMember(index, "documentType", e.target.value)
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          >
                            <option value="">— Selecciona —</option>
                            {DOCUMENT_TYPES.map((dt) => (
                              <option key={dt.value} value={dt.value}>
                                {dt.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Número de documento">
                          <input
                            type="text"
                            value={member.documentNumber}
                            onChange={(e) =>
                              updateMember(
                                index,
                                "documentNumber",
                                e.target.value,
                              )
                            }
                            maxLength={100}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={member.isContractSigner}
                          onChange={(e) =>
                            updateMember(
                              index,
                              "isContractSigner",
                              e.target.checked,
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Firmante del contrato
                      </label>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">
                  Datos legales para contrato
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre legal">
                    <input
                      type="text"
                      value={state.legalName}
                      onChange={(e) => update("legalName", e.target.value)}
                      maxLength={200}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Tipo de documento">
                    <select
                      value={state.documentType}
                      onChange={(e) => update("documentType", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Selecciona —</option>
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>
                          {dt.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Número de documento">
                    <input
                      type="text"
                      value={state.documentNumber}
                      onChange={(e) => update("documentNumber", e.target.value)}
                      maxLength={100}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Dirección / domicilio">
                    <input
                      type="text"
                      value={state.legalAddress}
                      onChange={(e) => update("legalAddress", e.target.value)}
                      maxLength={300}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="País">
                    <select
                      value={state.legalCountry}
                      onChange={(e) => onChangeCountry(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Selecciona —</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Departamento / Estado / Provincia">
                    {subdivisions.length > 0 ? (
                      <select
                        value={state.legalState}
                        onChange={(e) => update("legalState", e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="">— Selecciona —</option>
                        {subdivisions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={state.legalState}
                        onChange={(e) => update("legalState", e.target.value)}
                        maxLength={120}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}
                  </Field>
                  <Field label="Ciudad">
                    <input
                      type="text"
                      value={state.legalCity}
                      onChange={(e) => update("legalCity", e.target.value)}
                      maxLength={120}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
