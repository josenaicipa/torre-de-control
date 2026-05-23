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
}

const DASHBOARD_ITEMS = [
  { href: "/", label: "Torre CEO" },
  { href: "/", label: "Control Comercial" },
  { href: "/", label: "Marketing" },
  { href: "/", label: "Agendas / Leads" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OperationsShell({ children, actor, navItems }: OperationsShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-950 md:bg-[#0f1115]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-white/10 bg-[#15171d] text-white md:flex">
        <div className="border-b border-white/10 px-[18px] py-5">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-gradient-to-br from-[#e03a18] to-[#f58a00] text-[13px] font-black text-white">
              U
            </span>
            <span>
              <span className="block text-[11px] font-black leading-none tracking-[-0.02em] text-white">UNLOCKED</span>
              <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Command Center
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5">
          <p className="mb-1.5 ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Dashboard</p>
          <div className="space-y-0.5">
            {DASHBOARD_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center rounded-r-[9px] border-l-2 border-transparent px-3 py-2.5 text-xs font-medium text-slate-300 no-underline transition hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <p className="mb-1.5 ml-2 mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Operaciones</p>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center rounded-r-[9px] border-l-2 px-3 py-2.5 text-xs font-medium no-underline transition ${
                    active
                      ? "border-[#e03a18] bg-[#e03a18]/15 text-[#ff5a35]"
                      : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-[10px] leading-5 text-slate-400">
          <p className="truncate text-slate-300">{actor.email}</p>
          <p className="font-bold uppercase tracking-[0.08em] text-slate-500">{actor.role}</p>
        </div>
      </aside>

      <div className="md:ml-[220px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:border-white/10 md:bg-[#15171d] md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e03a18]">Command Center</p>
              <h1 className="truncate text-base font-black tracking-[-0.03em] text-slate-950 md:text-white">Operaciones</h1>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 no-underline hover:bg-slate-50 md:border-white/10 md:bg-white/5 md:text-slate-200 md:hover:bg-white/10"
            >
              Dashboard principal
            </Link>
          </div>
        </header>

        <main className="min-h-[calc(100vh-57px)] overflow-x-auto bg-slate-50 p-4 pb-24 md:p-6 md:pb-8">
          <div className="mx-auto max-w-[1380px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex overflow-x-auto border-t border-slate-200 bg-white md:hidden">
        <Link href="/" className="min-w-[92px] px-3 py-2 text-center text-[11px] font-bold text-slate-500 no-underline">
          Dashboard
        </Link>
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`min-w-[92px] px-3 py-2 text-center text-[11px] font-bold no-underline ${
                active ? "text-[#e03a18]" : "text-slate-500"
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
