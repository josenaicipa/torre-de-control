import type { Role } from "@prisma/client";
import type { PermissionId } from "./permissions";
import { ALL_PERMISSIONS, defaultPermissionsForRole } from "./permissions";

export interface MenuAccessItem {
  id: string;
  label: string;
  description: string;
  group?: "Comercial" | "Operaciones" | "Sistema";
  permissions: PermissionId[];
}

const DASHBOARD_READ: PermissionId[] = ["dashboard.read"];
const REPORTS_READ: PermissionId[] = ["dashboard.read", "reports.read"];
const USER_ADMIN: PermissionId[] = ["users.read", "users.create", "users.update", "users.suspend"];

export const MENU_ACCESS_ITEMS = [
  { id: "torre", label: "Torre CEO", description: "Vista ejecutiva principal", group: "Comercial", permissions: DASHBOARD_READ },
  { id: "colab", label: "Área Comercial", description: "Reporte por colaborador", group: "Comercial", permissions: DASHBOARD_READ },
  { id: "agendas", label: "Agendas / Leads", description: "Citas, leads y show ups", group: "Comercial", permissions: DASHBOARD_READ },
  { id: "control", label: "Control Comercial", description: "Seguimiento comercial diario", group: "Comercial", permissions: DASHBOARD_READ },
  { id: "operaciones", label: "Operaciones", description: "Entrada general al módulo operativo", group: "Operaciones", permissions: ["operaciones.read"] },
  { id: "operaciones-estudiantes", label: "Operaciones · Estudiantes", description: "Ver y editar estudiantes", group: "Operaciones", permissions: ["operaciones.read", "operaciones.write"] },
  { id: "operaciones-cartera", label: "Operaciones · Cartera", description: "Consultar cartera y registrar pagos", group: "Operaciones", permissions: ["operaciones.read", "operaciones.payments.write"] },
  { id: "operaciones-mentores", label: "Operaciones · Mentores", description: "Gestionar mentores", group: "Operaciones", permissions: ["operaciones.read", "operaciones.mentors.manage"] },
  { id: "operaciones-catalogo", label: "Operaciones · Catálogo", description: "Ver catálogo operativo", group: "Operaciones", permissions: ["operaciones.read", "operaciones.write"] },
  { id: "operaciones-importar", label: "Operaciones · Importar Excel", description: "Importar datos por Excel/CSV", group: "Operaciones", permissions: ["operaciones.read", "operaciones.import"] },
  { id: "comunidad-dropi", label: "Comunidad Dropi", description: "Módulo de comunidad", group: "Operaciones", permissions: ["operaciones.read"] },
  { id: "detalle", label: "Detalle Diario", description: "Registro y revisión diaria", group: "Comercial", permissions: REPORTS_READ },
  { id: "equipo", label: "Resumen Equipo", description: "Resumen operativo del equipo", group: "Comercial", permissions: REPORTS_READ },
  { id: "funnel", label: "Funnel", description: "Embudo comercial", group: "Comercial", permissions: REPORTS_READ },
  { id: "hist", label: "Histórico", description: "Histórico de desempeño", group: "Comercial", permissions: REPORTS_READ },
  { id: "admin", label: "Admin", description: "Usuarios y permisos", group: "Sistema", permissions: USER_ADMIN },
] as const satisfies readonly MenuAccessItem[];

export type MenuAccessId = (typeof MENU_ACCESS_ITEMS)[number]["id"];

const MENU_ACCESS_IDS = new Set<string>(MENU_ACCESS_ITEMS.map((item) => item.id));
const ALL_PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function normalizeMenuAccess(input: FormDataEntryValue[] | string[] | undefined): MenuAccessId[] {
  const values = Array.isArray(input) ? input : [];
  return Array.from(new Set(values.map(String).filter((value) => MENU_ACCESS_IDS.has(value)))) as MenuAccessId[];
}

function uniqPermissions(values: PermissionId[]): PermissionId[] {
  return Array.from(new Set(values.filter((value) => ALL_PERMISSION_SET.has(value)))) as PermissionId[];
}

export function menuAccessToPermissions(ids: readonly string[]): PermissionId[] {
  const selected = new Set(ids);
  return uniqPermissions(
    MENU_ACCESS_ITEMS.filter((item) => selected.has(item.id)).flatMap((item) => item.permissions),
  );
}

// Turn the menu tabs an admin checked into the permissions to store on the user.
// When no tab is selected we fall back to the role defaults instead of leaving
// the account with zero permissions, which would lock it out of every menu
// (the source of the "solo entra a operaciones / nada carga" reports). MENTOR is
// always clamped to its operaciones-only scope.
export function resolveUserPermissions(
  role: Role,
  selectedMenuPermissions: readonly PermissionId[],
): PermissionId[] {
  if (role === "MENTOR") {
    const ops = selectedMenuPermissions.filter((permission) => permission.startsWith("operaciones."));
    return ops.length > 0 ? (ops as PermissionId[]) : defaultPermissionsForRole(role);
  }
  return selectedMenuPermissions.length > 0
    ? [...selectedMenuPermissions]
    : defaultPermissionsForRole(role);
}

export function deriveMenuAccessFromPermissions(role: Role | string, permissions: readonly string[]): MenuAccessId[] {
  if (role === "ADMIN") return MENU_ACCESS_ITEMS.map((item) => item.id) as MenuAccessId[];
  const permissionSet = new Set(permissions);
  return MENU_ACCESS_ITEMS.filter((item) => item.permissions.every((permission) => permissionSet.has(permission))).map(
    (item) => item.id,
  ) as MenuAccessId[];
}
