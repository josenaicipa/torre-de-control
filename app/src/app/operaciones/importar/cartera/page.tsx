import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { CarteraImportForm } from "./upload-form";
import { RevertBatchesPanel } from "./revert-batches-panel";

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
          Importar Cuadro de Pagos (histórico)
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Importación única del Google Sheet histórico. Primero subí el CSV y revisá la vista
          previa (simulación, no escribe nada).
          <strong className="ml-1 text-slate-700">
            Recién al confirmar en el Paso 3 se escriben los registros en la base de datos.
          </strong>
        </p>
      </div>

      <div className="space-y-8">
        <CarteraImportForm />
        <RevertBatchesPanel />
      </div>
    </div>
  );
}
