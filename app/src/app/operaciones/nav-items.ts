import type { Role } from "@prisma/client";

export interface OperacionesNavItem {
  href: string;
  label: string;
  roles: Role[];
}

export const OPERACIONES_NAV_ITEMS: OperacionesNavItem[] = [
  { href: "/operaciones/estudiantes", label: "Estudiantes", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/cartera", label: "Cartera", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/mentores", label: "Mentores", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/catalogo", label: "Catálogo", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/importar", label: "Importar Excel", roles: ["ADMIN", "OPERATOR"] },
  { href: "/operaciones/configuracion", label: "Configuración", roles: ["ADMIN", "OPERATOR"] },
  { href: "/operaciones/mis-estudiantes", label: "Mis Estudiantes", roles: ["MENTOR"] },
];

export function getVisibleNavItems(role: Role) {
  return OPERACIONES_NAV_ITEMS.filter((item) => item.roles.includes(role)).map(
    ({ href, label }) => ({ href, label }),
  );
}
