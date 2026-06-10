import type { DataScope, OperationalPosition, Role } from "@prisma/client";
import type { PermissionId } from "./permissions";
import { ALL_PERMISSIONS } from "./permissions";

export type PermissionPresetId =
  | "admin-total"
  | "director-comercial"
  | "closer-high-ticket"
  | "setter"
  | "solo-lectura"
  | "operaciones-mentor";

export interface PermissionPreset {
  id: PermissionPresetId;
  label: string;
  description: string;
  role: Role;
  position: OperationalPosition;
  dataScope: DataScope;
  permissions: PermissionId[];
}

const DASHBOARD_EDITOR_PERMISSIONS: PermissionId[] = ["dashboard.read", "dashboard.write", "reports.read"];

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: "admin-total",
    label: "Admin total",
    description: "Control completo sobre usuarios, permisos, dashboard, reportes, automatizaciones, integraciones y operaciones.",
    role: "ADMIN",
    position: "ADMIN",
    dataScope: "ALL",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    id: "director-comercial",
    label: "Director comercial",
    description: "Puede ver y editar reportes comerciales de su alcance, exportar reportes y operar automatizaciones.",
    role: "OPERATOR",
    position: "DIRECTOR",
    dataScope: "AREA",
    permissions: [
      "dashboard.read",
      "dashboard.write",
      "reports.read",
      "reports.export",
      "automation.read",
      "automation.run",
    ],
  },
  {
    id: "closer-high-ticket",
    label: "Closer High Ticket",
    description: "Puede cargar y corregir sus reportes diarios de High Ticket sin administrar usuarios.",
    role: "OPERATOR",
    position: "CLOSER",
    dataScope: "OWN",
    permissions: [...DASHBOARD_EDITOR_PERMISSIONS],
  },
  {
    id: "setter",
    label: "Setter",
    description: "Puede cargar y corregir sus reportes diarios de setter sin administrar usuarios.",
    role: "OPERATOR",
    position: "SETTER",
    dataScope: "OWN",
    permissions: [...DASHBOARD_EDITOR_PERMISSIONS],
  },
  {
    id: "solo-lectura",
    label: "Solo lectura",
    description: "Puede consultar dashboard, reportes y operaciones sin editar datos ni usuarios.",
    role: "VIEWER",
    position: "VIEWER",
    dataScope: "OWN",
    permissions: ["dashboard.read", "reports.read", "operaciones.read"],
  },
  {
    id: "operaciones-mentor",
    label: "Operaciones / Mentor",
    description: "Puede gestionar información operativa de sus estudiantes sin permisos comerciales ni administración de usuarios.",
    role: "MENTOR",
    position: "VIEWER",
    dataScope: "OWN",
    permissions: ["operaciones.read", "operaciones.write"],
  },
];

export function isPermissionPresetId(value: string): value is PermissionPresetId {
  return PERMISSION_PRESETS.some((preset) => preset.id === value);
}

export function getPermissionPreset(id: PermissionPresetId): PermissionPreset {
  const preset = PERMISSION_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown permission preset: ${id}`);
  }
  return preset;
}
