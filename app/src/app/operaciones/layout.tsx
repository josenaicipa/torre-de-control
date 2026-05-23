import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/operaciones/estudiantes", label: "Estudiantes", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/cartera", label: "Cartera", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/mentores", label: "Mentores", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/importar", label: "Importar Excel", roles: ["ADMIN", "OPERATOR"] },
  { href: "/operaciones/mis-estudiantes", label: "Mis Estudiantes", roles: ["MENTOR"] },
];

export default async function OperacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(actor.role));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white p-4">
        <Link href="/dashboard" className="mb-6 block text-sm text-slate-500 hover:text-slate-900">
          ← Volver al dashboard
        </Link>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Operaciones</h2>
        <nav className="space-y-1">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>{actor.email}</p>
          <p className="mt-1 font-medium uppercase tracking-wide">{actor.role}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
