import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-slate-900">Torre de Control</h1>
        <p className="mt-2 text-sm text-slate-600">
          Accede al dashboard principal o al módulo operativo de estudiantes.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ir al dashboard principal
          </Link>
          <Link
            href="/operaciones"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ir a Operaciones
          </Link>
        </div>
      </div>
    </main>
  );
}
