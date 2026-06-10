import type { DataScope, OperationalPosition, Role } from "@prisma/client";
import { canManageUsers, POSITION_LABELS } from "./permissions";

interface EffectiveAccessInput {
  role: Role;
  position: OperationalPosition;
  dataScope: DataScope;
  permissions: string[];
  areaName?: string | null;
  teamName?: string | null;
  managerName?: string | null;
}

interface EffectiveAccessSummary {
  badges: string[];
  scopeLabel: string;
  description: string;
}

function hasPermission(input: EffectiveAccessInput, permission: string): boolean {
  return input.role === "ADMIN" || input.permissions.includes(permission);
}

function scopeLabel(input: EffectiveAccessInput): string {
  switch (input.dataScope) {
    case "ALL":
      return "Todo el dashboard";
    case "AREA":
      return input.areaName ? `Área ${input.areaName}` : "Su área asignada";
    case "TEAM":
      return input.teamName ? `Equipo ${input.teamName}` : "Su equipo asignado";
    case "CUSTOM":
      return "Alcance custom";
    case "OWN":
    default:
      return "Solo su propio reporte";
  }
}

export function summarizeEffectiveAccess(input: EffectiveAccessInput): EffectiveAccessSummary {
  const canEditDashboard = hasPermission(input, "dashboard.write");
  const canReadDashboard = hasPermission(input, "dashboard.read");
  const canAdminUsers = canManageUsers(input.role, input.permissions);
  const scope = scopeLabel(input);

  const badges = [
    input.role === "ADMIN" ? "Admin total" : POSITION_LABELS[input.position],
    canEditDashboard ? "Puede editar reportes" : "Solo lectura",
    canAdminUsers ? "Puede administrar usuarios" : "Sin admin usuarios",
  ];

  let description: string;
  if (input.role === "ADMIN") {
    description = "Puede administrar usuarios, permisos y datos de todo el dashboard.";
  } else if (canEditDashboard) {
    description = `Puede editar reportes diarios dentro de su alcance: ${scope.toLowerCase()}.`;
  } else if (canReadDashboard || hasPermission(input, "reports.read")) {
    description = "Puede consultar dashboard/reportes, pero no editar datos ni usuarios.";
  } else {
    description = "No tiene acceso operativo al dashboard ni a la administración de usuarios.";
  }

  return {
    badges,
    scopeLabel: scope,
    description,
  };
}
