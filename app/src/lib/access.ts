/**
 * Server-side mentor scoping. CADA query que retorne Students DEBE pasar por acá
 * cuando el actor podría ser un MENTOR. Para ADMIN/OPERATOR/VIEWER no aplica filtro.
 *
 * Regla del blueprint: nunca confiar en el cliente para el scoping. Todo aquí.
 */

import type { Role } from "@prisma/client";

export interface ActorContext {
  userId: string;
  role: Role;
  mentorId: string | null; // Si role=MENTOR, el id de su Mentor row vinculado
}

/**
 * Devuelve el filtro Prisma `where` a aplicar a queries de Student.
 * Para MENTOR: { mentorId: actor.mentorId }
 * Para otros: {} (sin restricción)
 *
 * Si el actor es MENTOR pero no tiene mentorId vinculado, retorna { id: "__none__" }
 * (filtro imposible) para no exponer ningún estudiante.
 */
export function studentScopeFor(actor: ActorContext): Record<string, unknown> {
  if (actor.role !== "MENTOR") return {};
  if (!actor.mentorId) return { id: "__none__" };
  return { mentorId: actor.mentorId };
}

/**
 * Verifica si un actor puede acceder a un Student específico.
 * Útil para endpoints que reciben studentId en la URL.
 */
export function canAccessStudent(
  actor: ActorContext,
  studentMentorId: string | null,
): boolean {
  if (actor.role !== "MENTOR") return true;
  if (!actor.mentorId) return false;
  return studentMentorId === actor.mentorId;
}

/**
 * Combina el scope del actor con filtros adicionales del cliente.
 * El scope del actor siempre gana — no se puede sobrescribir.
 */
export function mergeStudentScope(
  actor: ActorContext,
  extraWhere: Record<string, unknown> = {},
): Record<string, unknown> {
  const scope = studentScopeFor(actor);
  return { ...extraWhere, ...scope };
}
