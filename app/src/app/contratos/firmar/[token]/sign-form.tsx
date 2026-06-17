"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  SIGNATURE_IMAGE_MAX_BYTES,
  validateSignatureImage,
} from "@/lib/operaciones-contract";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function SignForm({
  token,
  defaultName,
}: {
  token: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [accepted, setAccepted] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      setSignatureImage(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setSignatureImage(null);
      setError("La firma debe ser una imagen PNG o JPEG");
      event.target.value = "";
      return;
    }
    if (file.size > SIGNATURE_IMAGE_MAX_BYTES) {
      setSignatureImage(null);
      setError("La imagen de la firma supera el límite de 1 MB");
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const validation = validateSignatureImage(dataUrl);
      if (!validation.ok) {
        setSignatureImage(null);
        setError(validation.error);
        event.target.value = "";
        return;
      }
      setSignatureImage(validation.dataUrl);
    } catch {
      setSignatureImage(null);
      setError("No se pudo procesar la imagen de la firma");
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 3) {
      setError("Ingresa tu nombre completo para firmar");
      return;
    }
    if (!signatureImage) {
      setError("Sube una foto de tu firma para continuar");
      return;
    }
    if (!accepted) {
      setError("Debes aceptar el contrato para firmar");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/contratos/firmar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: name.trim(),
          accepted,
          signatureImage,
        }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "No se pudo firmar el contrato");
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red al firmar el contrato");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Nombre completo del firmante</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="rounded-md border-2 border-dashed border-indigo-300 bg-white p-4">
        <label className="block">
          <span className="text-sm font-bold text-indigo-900">
            Subir imagen de firma (PNG/JPG)
          </span>
          <span className="mt-1 block text-xs text-slate-600">
            Sube una foto clara de tu firma manuscrita (PNG o JPG, máximo 1 MB).
            Firma en una hoja blanca y tómale una foto bien iluminada.
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={onFileChange}
            required
            className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
          />
        </label>
      </div>

      {signatureImage && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Vista previa de tu firma</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureImage}
            alt="Vista previa de la firma"
            className="mt-2 max-h-28 w-auto rounded bg-white object-contain"
          />
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        Acepto las condiciones descritas en este contrato.
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Firmando..." : "Firmar contrato"}
      </button>
    </form>
  );
}
