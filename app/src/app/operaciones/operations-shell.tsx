"use client";

import {
  BarChart2,
  BookOpen,
  Briefcase,
  Calendar,
  ClipboardCheck,
  DollarSign,
  Filter,
  History,
  Home,
  Megaphone,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
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

interface SidebarItemProps {
  href: string;
  label: string;
  Icon?: LucideIcon;
  active: boolean;
  isSubitem?: boolean;
}

const BRAND = "#E03A18";
const TXT = "#111110";
const TXT2 = "#5C5C52";
const TXT3 = "#9C9B93";
const SURFACE = "#FFFFFF";
const BORDER = "#E5E4DF";

// Query tab ids match app/public/index.html so links land on the requested view.
const LEGACY_TABS: Array<{
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
}> = [
  { id: "torre", label: "Torre CEO", href: "/", Icon: Home },
  { id: "closer", label: "Area Comercial", href: "/?tab=closer", Icon: DollarSign },
  { id: "control", label: "Control Comercial", href: "/?tab=control", Icon: ClipboardCheck },
  { id: "entrada", label: "Marketing", href: "/?tab=entrada", Icon: Megaphone },
  { id: "agendas", label: "Agendas / Leads", href: "/?tab=agendas", Icon: Calendar },
  { id: "equipo", label: "Resumen Equipo", href: "/?tab=equipo", Icon: Users },
  { id: "funnel", label: "Funnel", href: "/?tab=funnel", Icon: Filter },
  { id: "detalle", label: "Detalle Diario", href: "/?tab=detalle", Icon: BarChart2 },
  { id: "colab", label: "Por Colaborador", href: "/?tab=colab", Icon: User },
  { id: "hist", label: "Histórico", href: "/?tab=hist", Icon: History },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarItem({
  href,
  label,
  Icon,
  active,
  isSubitem = false,
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: isSubitem ? "6px 16px 6px 44px" : "8px 16px",
        fontSize: isSubitem ? 13 : 14,
        fontWeight: active ? 700 : 500,
        color: active ? BRAND : TXT2,
        backgroundColor: active ? "rgba(224, 58, 24, 0.10)" : "transparent",
        borderLeft: active ? `2px solid ${BRAND}` : "2px solid transparent",
        textDecoration: "none",
      }}
    >
      {Icon && <Icon size={15} color={active ? BRAND : TXT3} />}
      <span>{label}</span>
    </Link>
  );
}

export function OperationsShell({
  children,
  actor,
  navItems,
}: OperationsShellProps) {
  const pathname = usePathname();
  const operationItems = navItems.filter(
    (item) => item.href !== "/admin/users" && item.href !== "/operaciones/mis-estudiantes",
  );
  const operationsActive = pathname.startsWith("/operaciones");
  const showAdmin =
    actor.role === "ADMIN" || navItems.some((item) => item.href === "/admin/users");

  return (
    <div className="flex min-h-screen bg-[#f7f7f5]" style={{ color: TXT }}>
      <aside
        data-operations-sidebar
        className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col overflow-y-auto md:flex"
        style={{ backgroundColor: SURFACE, borderRight: `1px solid ${BORDER}` }}
      >
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: TXT,
              textDecoration: "none",
            }}
          >
            <img src="/logo.png" alt="Unlocked" style={{ height: 30, width: 30, objectFit: "contain" }} />
            <span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
                UNLOCKED
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 2,
                  color: TXT3,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Command Center
              </span>
            </span>
          </Link>
        </div>

        <nav style={{ display: "flex", flex: 1, flexDirection: "column", padding: "14px 0 10px" }}>
          <p
            style={{
              margin: "0 16px 8px",
              color: TXT3,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Navegación
          </p>
          {LEGACY_TABS.map((item) => (
            <SidebarItem
              key={item.id}
              href={item.href}
              label={item.label}
              Icon={item.Icon}
              active={false}
            />
          ))}

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                backgroundColor: operationsActive ? "rgba(224, 58, 24, 0.10)" : "transparent",
                borderLeft: operationsActive ? `2px solid ${BRAND}` : "2px solid transparent",
                color: operationsActive ? BRAND : TXT2,
                fontSize: 14,
                fontWeight: operationsActive ? 700 : 500,
              }}
            >
              <Briefcase size={15} color={operationsActive ? BRAND : TXT3} />
              <span style={{ flex: 1 }}>Operaciones</span>
              <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
            </div>
            {operationItems.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(pathname, item.href)}
                isSubitem
              />
            ))}
          </div>

          {actor.role === "MENTOR" && (
            <SidebarItem
              href="/operaciones/mis-estudiantes"
              label="Mis Estudiantes"
              Icon={BookOpen}
              active={isActive(pathname, "/operaciones/mis-estudiantes")}
            />
          )}

          {showAdmin && (
            <SidebarItem
              href="/admin/users"
              label="Admin"
              Icon={Settings}
              active={isActive(pathname, "/admin/users")}
            />
          )}
        </nav>

        <div
          style={{
            borderTop: `1px solid ${BORDER}`,
            padding: "12px 16px",
            color: TXT3,
            fontSize: 10,
            lineHeight: "20px",
          }}
        >
          <p className="truncate" style={{ margin: 0, color: TXT2 }}>
            {actor.email}
          </p>
          <p style={{ margin: 0, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {actor.role}
          </p>
        </div>
      </aside>

      <main
        data-operations-main
        className="min-h-screen flex-1 overflow-x-auto bg-slate-50 p-4 pb-24 md:ml-[220px] md:p-8"
      >
        {children}
      </main>

      <nav
        data-operations-mobile-nav
        className="fixed inset-x-0 bottom-0 z-50 flex overflow-x-auto md:hidden"
        style={{ backgroundColor: SURFACE, borderTop: `1px solid ${BORDER}` }}
      >
        <Link
          href="/"
          style={{
            minWidth: 92,
            padding: "8px 12px",
            color: TXT2,
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Dashboard
        </Link>
        {operationItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                minWidth: 92,
                padding: "8px 12px",
                color: active ? BRAND : TXT2,
                fontSize: 11,
                fontWeight: 700,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
