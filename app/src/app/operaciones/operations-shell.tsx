"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface OperationsNavItem {
  href: string;
  label: string;
}

interface OperationsShellProps {
  children: React.ReactNode;
  actor: {
    email: string;
    role: string;
  };
  navItems: OperationsNavItem[];
  title?: string;
  eyebrow?: string;
}

const BRAND = "#E03A18";
const TXT = "#111110";
const TXT2 = "#5C5C52";
const TXT3 = "#9C9B93";
const SURFACE = "#FFFFFF";
const BORDER = "#E5E4DF";

// Query tab ids match app/public/index.html so links land on the requested view.
const LEGACY_TABS = [
  { id: "torre", label: "Torre CEO", href: "/" },
  { id: "closer", label: "Area Comercial", href: "/?tab=closer" },
  { id: "control", label: "Control Comercial", href: "/?tab=control" },
  { id: "entrada", label: "Marketing", href: "/?tab=entrada" },
  { id: "agendas", label: "Agendas / Leads", href: "/?tab=agendas" },
  { id: "equipo", label: "Resumen Equipo", href: "/?tab=equipo" },
  { id: "funnel", label: "Funnel", href: "/?tab=funnel" },
  { id: "detalle", label: "Detalle Diario", href: "/?tab=detalle" },
  { id: "colab", label: "Por Colaborador", href: "/?tab=colab" },
  { id: "hist", label: "Histórico", href: "/?tab=hist" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OperationsShell({
  children,
  actor,
  navItems,
}: OperationsShellProps) {
  const pathname = usePathname();
  const operationItems = navItems.filter((item) => item.href !== "/admin/users");
  const showAdmin = actor.role === "ADMIN" || navItems.some((item) => item.href === "/admin/users");

  return (
    <div className="flex min-h-screen bg-[#f7f7f5] text-[#111110]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col overflow-y-auto border-r border-[#e5e4df] bg-white md:flex">
        <div className="border-b border-[#e5e4df] px-[18px] pb-4 pt-5">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <img src="/logo.png" alt="Unlocked" className="h-[30px] w-[30px] object-contain" />
            <span>
              <span className="block text-[11px] font-extrabold leading-none tracking-normal text-[#111110]">UNLOCKED</span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9c9b93]">
                Command Center
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-2.5 py-2.5">
          <p className="mb-1.5 ml-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#9c9b93]">
            Navegación
          </p>
          {LEGACY_TABS.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="mb-0.5 block rounded-r-[9px] border-l-2 border-transparent px-3 py-[9px] text-xs font-medium text-[#5c5c52] no-underline transition hover:bg-[#f4f4f1] hover:text-[#111110]"
            >
              {item.label}
            </a>
          ))}

          <div className="mb-0.5 flex flex-col">
            <div
              className="flex items-center rounded-r-[9px] border-l-2 border-[#e03a18] bg-[#e03a18]/10 px-3 py-[9px] text-xs font-bold text-[#e03a18]"
            >
              <span className="flex-1">Operaciones</span>
              <span className="text-[10px] opacity-60">▼</span>
            </div>
            {operationItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-r-[9px] py-[7px] pl-[37px] pr-3 text-xs font-medium no-underline transition ${
                    active
                      ? "bg-[#e03a18]/10 text-[#e03a18]"
                      : "text-[#5c5c52] hover:bg-[#e03a18]/5 hover:text-[#111110]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {showAdmin && (
            <Link
              href="/admin/users"
              className={`mt-1 block rounded-r-[9px] border-l-2 px-3 py-[9px] text-xs font-medium no-underline transition ${
                pathname === "/admin/users"
                  ? "border-[#e03a18] bg-[#e03a18]/10 font-bold text-[#e03a18]"
                  : "border-transparent text-[#5c5c52] hover:bg-[#f4f4f1] hover:text-[#111110]"
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="border-t border-[#e5e4df] px-4 py-3 text-[10px] leading-5 text-[#9c9b93]">
          <p className="truncate text-[#5c5c52]">{actor.email}</p>
          <p className="font-bold uppercase tracking-[0.08em]">{actor.role}</p>
        </div>
      </aside>

      <main className="min-h-screen flex-1 overflow-x-auto bg-slate-50 p-4 pb-24 md:ml-[220px] md:p-8">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex overflow-x-auto border-t border-[#e5e4df] bg-white md:hidden">
        <a href="/" className="min-w-[92px] px-3 py-2 text-center text-[11px] font-bold text-[#5c5c52] no-underline">
          Dashboard
        </a>
        {operationItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`min-w-[92px] px-3 py-2 text-center text-[11px] font-bold no-underline ${
                active ? "text-[#e03a18]" : "text-[#5c5c52]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
