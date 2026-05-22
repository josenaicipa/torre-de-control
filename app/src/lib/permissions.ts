import type { Role } from "@prisma/client";

export const PERMISSION_GROUPS = [
  {
    id: "dashboard",
    label: "Dashboard",
    permissions: [
      { id: "dashboard.read", label: "Ver dashboard" },
      { id: "dashboard.write", label: "Actualizar dashboard" },
    ],
  },
  {
    id: "users",
    label: "Usuarios",
    permissions: [
      { id: "users.read", label: "Ver usuarios" },
      { id: "users.create", label: "Crear usuarios" },
      { id: "users.update", label: "Editar usuarios" },
      { id: "users.suspend", label: "Suspender usuarios" },
    ],
  },
  {
    id: "reports",
    label: "Reportes",
    permissions: [
      { id: "reports.read", label: "Ver reportes" },
      { id: "reports.export", label: "Exportar reportes" },
    ],
  },
  {
    id: "automation",
    label: "Automatizaciones",
    permissions: [
      { id: "automation.read", label: "Ver automatizaciones" },
      { id: "automation.run", label: "Ejecutar automatizaciones" },
    ],
  },
  {
    id: "integrations",
    label: "Integraciones",
    permissions: [
      { id: "integrations.read", label: "Ver integraciones" },
      { id: "integrations.manage", label: "Administrar integraciones" },
    ],
  },
] as const;

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.id),
);

export type PermissionId = (typeof ALL_PERMISSIONS)[number];

export function normalizePermissions(input: FormDataEntryValue[] | string[] | undefined): PermissionId[] {
  const values = Array.isArray(input) ? input : [];
  const allowed = new Set<string>(ALL_PERMISSIONS);
  return Array.from(new Set(values.map(String).filter((value) => allowed.has(value)))) as PermissionId[];
}

export function defaultPermissionsForRole(role: Role): PermissionId[] {
  if (role === "ADMIN") return [...ALL_PERMISSIONS];
  if (role === "OPERATOR") {
    return ALL_PERMISSIONS.filter(
      (permission) =>
        permission === "dashboard.read" ||
        permission === "dashboard.write" ||
        permission === "reports.read" ||
        permission === "reports.export" ||
        permission === "automation.read" ||
        permission === "automation.run",
    ) as PermissionId[];
  }
  return ["dashboard.read", "reports.read"];
}

export function canManageUsers(role: string, permissions: string[] = []): boolean {
  return role === "ADMIN" || permissions.includes("users.create") || permissions.includes("users.update");
}
