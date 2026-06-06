/**
 * Labels y estilos en español para el enum StudentStatus de Prisma.
 *
 * Centralizado para que las tablas de Operaciones (Estudiantes, Mis
 * estudiantes, detalle de estudiante) y sus filtros muestren siempre el mismo
 * texto en español y nunca el valor crudo del enum (p. ej. "SEPARATED").
 */

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  SEPARATED: "Separado",
  COMPLETED: "Completado",
  DROPPED: "Retirado",
  EXTENDED: "Extendido",
  ACCESS_REVOKED: "Sin accesos",
  INACTIVE: "Inactivo",
  WITHDRAWN: "Dado de baja",
};

export function studentStatusLabel(status: string): string {
  return STUDENT_STATUS_LABELS[status] ?? status;
}

export const STUDENT_STATUS_BADGE_CLASSES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  SEPARATED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  DROPPED: "bg-slate-200 text-slate-700",
  EXTENDED: "bg-purple-100 text-purple-700",
  ACCESS_REVOKED: "bg-rose-100 text-rose-700",
  INACTIVE: "bg-slate-200 text-slate-700",
  WITHDRAWN: "bg-slate-200 text-slate-700",
};

export function studentStatusBadgeClass(status: string): string {
  return STUDENT_STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-700";
}

// Orden de aparición en selects/filtros de estado.
export const STUDENT_STATUS_FILTER_ORDER = [
  "ACTIVE",
  "PAUSED",
  "SEPARATED",
  "COMPLETED",
  "DROPPED",
  "EXTENDED",
  "ACCESS_REVOKED",
  "INACTIVE",
  "WITHDRAWN",
] as const;

export const STUDENT_STATUS_OPTIONS: { value: string; label: string }[] =
  STUDENT_STATUS_FILTER_ORDER.map((value) => ({
    value,
    label: STUDENT_STATUS_LABELS[value],
  }));
