import type { DataScope, OperationalPosition, Role } from "@prisma/client";

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
  {
    id: "operaciones",
    label: "Operaciones",
    permissions: [
      { id: "operaciones.read", label: "Ver modulo Operaciones" },
      { id: "operaciones.write", label: "Crear/editar estudiantes y datos" },
      { id: "operaciones.payments.write", label: "Registrar pagos" },
      { id: "operaciones.mentors.manage", label: "Gestionar mentores" },
      { id: "operaciones.import", label: "Importar (Excel/CSV)" },
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
      (p) =>
        p === "dashboard.read" ||
        p === "dashboard.write" ||
        p === "reports.read" ||
        p === "reports.export" ||
        p === "automation.read" ||
        p === "automation.run" ||
        p === "operaciones.read" ||
        p === "operaciones.write" ||
        p === "operaciones.payments.write" ||
        p === "operaciones.import",
    ) as PermissionId[];
  }
  if (role === "MENTOR") {
    // MENTOR solo trabaja sobre sus estudiantes en Operaciones.
    return ["operaciones.read", "operaciones.write"];
  }
  return ["dashboard.read", "reports.read", "operaciones.read"];
}

export function canManageUsers(role: string, permissions: string[] = []): boolean {
  return role === "ADMIN" || permissions.includes("users.create") || permissions.includes("users.update");
}

// --- Operational positions (Cargo) and data scopes (Alcance) ---------------
// Spanish labels for the admin panel. Naming is fixed: never Comercial/Jefe.

export const POSITION_LABELS: Record<OperationalPosition, string> = {
  ADMIN: "Admin",
  DIRECTOR: "Director",
  CLOSER: "Closer",
  SETTER: "Setter",
  VIEWER: "Viewer",
};

export const SCOPE_LABELS: Record<DataScope, string> = {
  ALL: "Todo",
  AREA: "Área",
  TEAM: "Equipo",
  OWN: "Solo propio",
  CUSTOM: "Custom",
};

export const OPERATIONAL_POSITIONS = Object.keys(POSITION_LABELS) as OperationalPosition[];
export const DATA_SCOPES = Object.keys(SCOPE_LABELS) as DataScope[];

export function parsePosition(value: FormDataEntryValue | null): OperationalPosition {
  if (typeof value === "string" && (OPERATIONAL_POSITIONS as string[]).includes(value)) {
    return value as OperationalPosition;
  }
  return "VIEWER";
}

export function parseScope(value: FormDataEntryValue | null): DataScope {
  if (typeof value === "string" && (DATA_SCOPES as string[]).includes(value)) {
    return value as DataScope;
  }
  return "OWN";
}

// Sensible default scope per position, used to pre-select the Alcance field.
export function defaultScopeForPosition(position: OperationalPosition): DataScope {
  switch (position) {
    case "ADMIN":
      return "ALL";
    case "DIRECTOR":
      return "AREA";
    case "CLOSER":
    case "SETTER":
    case "VIEWER":
    default:
      return "OWN";
  }
}

// Default module permissions per position. Admin gets everything; Director can
// read dashboard/reports; Closer/Setter/Viewer get viewer-like read access.
export function defaultPermissionsForPosition(position: OperationalPosition): PermissionId[] {
  if (position === "ADMIN") return [...ALL_PERMISSIONS];
  if (position === "DIRECTOR") {
    return ALL_PERMISSIONS.filter(
      (permission) =>
        permission === "dashboard.read" ||
        permission === "reports.read" ||
        permission === "reports.export",
    ) as PermissionId[];
  }
  // CLOSER, SETTER, VIEWER -> viewer-like.
  return ["dashboard.read", "reports.read"];
}
