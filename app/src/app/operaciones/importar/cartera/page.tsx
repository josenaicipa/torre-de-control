import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { CarteraImportForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function ImportCarteraPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/operaciones/importar");

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <Link
          href="/operaciones/importar"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Importar
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Importar Cuadro de Pagos (legacy)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Importación única del Google Sheet histórico. Subí el CSV para revisar el preview.
          <strong className="ml-1 text-slate-700">
            No se escribe nada en la base de datos en esta etapa.
          </strong>
        </p>
      </div>

      <CarteraImportForm />
    </div>
  );
}
