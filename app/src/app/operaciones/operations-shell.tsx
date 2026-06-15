"use client";

import {
  BarChart2,
  BookOpen,
  Briefcase,
  Calendar,
  ClipboardCheck,
  DollarSign,
  Filter,
  Globe,
  History,
  Home,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  onClick?: () => void;
}

const BRAND = "#F23005";
const TXT = "#0C0E0E";
const TXT2 = "#565D5E";
const TXT3 = "#9CA5A6";
const SURFACE = "#FFFFFF";
const BORDER = "#E2E4E4";

// Query tab ids match app/public/index.html so links land on the requested view.
const LEGACY_TABS: Array<{
  id: string;
  label: string;
  href: string;
  Icon: LucideIcon;
}> = [
  { id: "torre", label: "Torre CEO", href: "/", Icon: Home },
  { id: "closer", label: "Área Comercial", href: "/?tab=closer", Icon: DollarSign },
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
  onClick,
}: SidebarItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: isSubitem ? "6px 16px 6px 44px" : "8px 16px",
        fontSize: isSubitem ? 13 : 14,
        fontWeight: active ? 700 : 500,
        color: active ? BRAND : TXT2,
        backgroundColor: active ? "rgba(242, 48, 5, 0.10)" : "transparent",
        borderLeft: active ? `2px solid ${BRAND}` : "2px solid transparent",
        textDecoration: "none",
      }}
    >
      {Icon && <Icon size={15} color={active ? BRAND : TXT3} />}
      <span>{label}</span>
    </Link>
  );
}

interface NavigationContentProps {
  pathname: string;
  operationItems: OperationsNavItem[];
  operationsExpanded: boolean;
  onToggleOperations: () => void;
  operationsActive: boolean;
  comunidadDropiActive: boolean;
  showMentor: boolean;
  showAdmin: boolean;
  onItemClick?: () => void;
}

function NavigationContent({
  pathname,
  operationItems,
  operationsExpanded,
  onToggleOperations,
  operationsActive,
  comunidadDropiActive,
  showMentor,
  showAdmin,
  onItemClick,
}: NavigationContentProps) {
  return (
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
          onClick={onItemClick}
        />
      ))}

      <div style={{ display: "flex", flexDirection: "column" }}>
        <button
          type="button"
          onClick={onToggleOperations}
          aria-expanded={operationsExpanded}
          aria-controls="operations-subnav"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            backgroundColor: operationsActive ? "rgba(242, 48, 5, 0.10)" : "transparent",
            borderLeft: operationsActive ? `2px solid ${BRAND}` : "2px solid transparent",
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
            color: operationsActive ? BRAND : TXT2,
            fontSize: 14,
            fontWeight: operationsActive ? 700 : 500,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            fontFamily: "inherit",
          }}
        >
          <Briefcase size={15} color={operationsActive ? BRAND : TXT3} />
          <span style={{ flex: 1 }}>Operaciones</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{operationsExpanded ? "▼" : "▶"}</span>
        </button>
        {operationsExpanded && (
          <div id="operations-subnav">
            {operationItems.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                active={isActive(pathname, item.href)}
                isSubitem
                onClick={onItemClick}
              />
            ))}
          </div>
        )}
      </div>

      <SidebarItem
        href="/comunidad-dropi"
        label="Comunidad Dropi"
        Icon={Globe}
        active={comunidadDropiActive}
        onClick={onItemClick}
      />

      {showMentor && (
        <SidebarItem
          href="/operaciones/mis-estudiantes"
          label="Mis Estudiantes"
          Icon={BookOpen}
          active={isActive(pathname, "/operaciones/mis-estudiantes")}
          onClick={onItemClick}
        />
      )}

      {showAdmin && (
        <SidebarItem
          href="/admin/users"
          label="Admin"
          Icon={Settings}
          active={isActive(pathname, "/admin/users")}
          onClick={onItemClick}
        />
      )}
    </nav>
  );
}

export function OperationsShell({
  children,
  actor,
  navItems,
}: OperationsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [operationsExpanded, setOperationsExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const operationItems = navItems.filter(
    (item) => item.href !== "/admin/users" && item.href !== "/operaciones/mis-estudiantes",
  );
  const operationsActive = pathname.startsWith("/operaciones");
  const comunidadDropiActive = pathname.startsWith("/comunidad-dropi");
  const showAdmin =
    actor.role === "ADMIN" || navItems.some((item) => item.href === "/admin/users");
  const showMentor = actor.role === "MENTOR";

  // Si la app está embebida en iframe (shell legacy), el menú global es el dueño
  // de la navegación: ocultamos sidebar desktop, header móvil y drawer, y quitamos
  // el margen izquierdo para evitar el menú duplicado y el desplazamiento fantasma.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setIsEmbedded(window.self !== window.top);
    } catch {
      setIsEmbedded(true);
    }
  }, []);

  // Cerrar el menú móvil al navegar entre rutas.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Evitar scroll del body mientras el drawer está abierto.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!mobileMenuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const toggleOperations = () => setOperationsExpanded((prev) => !prev);
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  const brandBlock = (
    <Link
      href="/"
      onClick={closeMobileMenu}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: TXT,
        textDecoration: "none",
      }}
    >
      <img src="/brand/ecom-logo-color.png" alt="Unlocked Ecom" style={{ height: 30, width: 30, objectFit: "contain" }} />
      <span>
        <span style={{ display: "block", fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
          UNLOCKED ECOM
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
          Centro de Operaciones
        </span>
      </span>
    </Link>
  );

  const accountBlock = (
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
      <button
        type="button"
        onClick={handleLogout}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          marginTop: 10,
          padding: "8px 10px",
          backgroundColor: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          color: TXT2,
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <LogOut size={14} />
        <span>Cerrar sesión</span>
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#f6f7f7]" style={{ color: TXT }}>
      {!isEmbedded && (
        <aside
          data-operations-sidebar
          className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col overflow-y-auto md:flex"
          style={{ backgroundColor: SURFACE, borderRight: `1px solid ${BORDER}` }}
        >
          <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${BORDER}` }}>
            {brandBlock}
          </div>

          <NavigationContent
            pathname={pathname}
            operationItems={operationItems}
            operationsExpanded={operationsExpanded}
            onToggleOperations={toggleOperations}
            operationsActive={operationsActive}
            comunidadDropiActive={comunidadDropiActive}
            showMentor={showMentor}
            showAdmin={showAdmin}
          />

          {accountBlock}
        </aside>
      )}

      {!isEmbedded && (
        <header
          data-operations-mobile-header
          className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 px-4 md:hidden"
          style={{ backgroundColor: SURFACE, borderBottom: `1px solid ${BORDER}` }}
        >
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu-panel"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              backgroundColor: mobileMenuOpen ? "rgba(242, 48, 5, 0.10)" : SURFACE,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              color: mobileMenuOpen ? BRAND : TXT,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            <span>{mobileMenuOpen ? "Cerrar" : "Menú"}</span>
          </button>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/ecom-logo-color.png"
              alt="Unlocked Ecom"
              width={24}
              height={24}
              style={{ objectFit: "contain", flexShrink: 0 }}
            />
            <span
              className="truncate"
              style={{ fontSize: 15, fontWeight: 800, color: TXT, letterSpacing: "-0.02em" }}
            >
              Operaciones
            </span>
          </span>
        </header>
      )}

      {!isEmbedded && mobileMenuOpen && (
        <button
          type="button"
          data-operations-mobile-overlay
          aria-label="Cerrar menú"
          onClick={closeMobileMenu}
          className="fixed inset-0 z-40 md:hidden"
          style={{
            backgroundColor: "rgba(17,17,16,0.45)",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        />
      )}

      {!isEmbedded && (
        <aside
          id="mobile-menu-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          aria-hidden={!mobileMenuOpen}
          className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto md:hidden"
          style={{
            backgroundColor: SURFACE,
            borderRight: `1px solid ${BORDER}`,
            transform: mobileMenuOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 200ms ease-out",
            visibility: mobileMenuOpen ? "visible" : "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 16px",
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {brandBlock}
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={closeMobileMenu}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                border: "none",
                borderRadius: 8,
                backgroundColor: "transparent",
                color: TXT2,
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
          </div>

          <NavigationContent
            pathname={pathname}
            operationItems={operationItems}
            operationsExpanded={operationsExpanded}
            onToggleOperations={toggleOperations}
            operationsActive={operationsActive}
            comunidadDropiActive={comunidadDropiActive}
            showMentor={showMentor}
            showAdmin={showAdmin}
            onItemClick={closeMobileMenu}
          />

          {accountBlock}
        </aside>
      )}

      <main
        data-operations-main
        className={`min-h-screen flex-1 overflow-x-auto bg-[#f6f7f7] p-4 ${
          isEmbedded ? "" : "pt-20 md:ml-[220px]"
        } md:p-8`}
      >
        {children}
      </main>
    </div>
  );
}
