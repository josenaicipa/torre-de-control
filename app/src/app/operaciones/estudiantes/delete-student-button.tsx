"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

const CONFIRMATION_WORD = "ELIMINAR";

interface DeleteStudentButtonProps {
  studentId: string;
  studentName: string;
  /** "compact" para la acción inline en el listado, "full" para el detalle. */
  variant?: "compact" | "full";
  /** A dónde navegar tras eliminar. Si se omite, solo refresca. */
  redirectTo?: string;
}

export function DeleteStudentButton({
  studentId,
  studentName,
  variant = "compact",
  redirectTo,
}: DeleteStudentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (loading) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
  }, [loading]);

  const handleDelete = useCallback(async () => {
    if (confirmText !== CONFIRMATION_WORD) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/operaciones/students/${studentId}?hard=true`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: CONFIRMATION_WORD }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(json?.error ?? "No se pudo eliminar el estudiante.");
        setLoading(false);
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Error de red al eliminar el estudiante.");
      setLoading(false);
    }
  }, [confirmText, studentId, redirectTo, router]);

  const triggerClass =
    variant === "full"
      ? "inline-flex items-center gap-2 rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
      : "inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
        title="Eliminar data del estudiante de prueba"
      >
        <Trash2 className={variant === "full" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        Eliminar data
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">
              Eliminar definitivamente
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Vas a eliminar de forma <strong>permanente</strong> a{" "}
              <strong>{studentName}</strong> y toda su data operativa asociada:
              pagos, cronograma de pagos, avances, métricas y productos
              matriculados. Esta acción <strong>no se puede deshacer</strong>.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Para confirmar, escribe{" "}
              <span className="font-mono font-semibold text-rose-700">
                {CONFIRMATION_WORD}
              </span>{" "}
              en el campo de abajo.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRMATION_WORD}
              autoComplete="off"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {error && (
              <p className="mt-2 text-sm text-rose-600">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || confirmText !== CONFIRMATION_WORD}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
