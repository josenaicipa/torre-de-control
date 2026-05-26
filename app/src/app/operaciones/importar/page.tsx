import { ArrowRight, FileSpreadsheet, NotebookPen, TableProperties } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const isAdmin = actor.role === "ADMIN";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Importar</h1>
      <p className="mb-6 text-sm text-slate-500">
        Herramientas para cargar datos desde fuentes externas.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isAdmin && (
          <Link
            href="/operaciones/importar/cartera"
            className="block rounded-lg border border-slate-200 bg-white p-6 hover:border-slate-400 hover:shadow-sm"
          >
            <FileSpreadsheet size={20} className="mb-3 text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-900">Cuadro de Pagos (legacy)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Importación única del Google Sheet histórico de estudiantes y pagos. Solo ADMIN.
            </p>
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700">
              Disponible <ArrowRight size={13} />
            </p>
          </Link>
        )}

        <div className="cursor-not-allowed rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 opacity-60">
          <TableProperties size={20} className="mb-3 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Excel de Ventas (mensual)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Importación recurrente de ventas y métricas mensuales.
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">Próximamente</p>
        </div>

        <div className="cursor-not-allowed rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 opacity-60">
          <NotebookPen size={20} className="mb-3 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Sheets de Seguimiento</h2>
          <p className="mt-1 text-sm text-slate-600">
            Importación histórica de avances registrados por mentor.
          </p>
          <p className="mt-3 text-xs font-medium text-slate-500">Próximamente</p>
        </div>
      </div>
    </div>
  );
}
