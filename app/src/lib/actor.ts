/**
 * Resuelve ActorContext desde la session. Para MENTOR busca el Mentor row vinculado.
 */
import { prisma } from "./prisma";
import { getSession } from "./auth";
import type { Role } from "@prisma/client";

export interface ActorContext {
  userId: string;
  email: string;
  role: Role;
  mentorId: string | null;
}

/**
 * Lee la session, busca el User y (si es MENTOR) el Mentor vinculado.
 * Returns null si no hay session válida.
 */
export async function getActor(): Promise<ActorContext | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, active: true },
  });
  if (!user || !user.active) return null;

  let mentorId: string | null = null;
  if (user.role === "MENTOR") {
    const mentor = await prisma.mentor.findUnique({
      where: { userId: user.id },
      select: { id: true, active: true },
    });
    if (mentor && mentor.active) mentorId = mentor.id;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    mentorId,
  };
}

/**
 * Guards para roles. Tiran error que se traduce a 403 en las routes.
 */
export class ForbiddenError extends Error {
  constructor(message = "Sin permiso") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("No autorizado");
    this.name = "UnauthenticatedError";
  }
}

export function requireActor(actor: ActorContext | null): asserts actor is ActorContext {
  if (!actor) throw new UnauthenticatedError();
}

export function requireAdmin(actor: ActorContext): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError("Requiere rol ADMIN");
}

export function requireOperatorOrAdmin(actor: ActorContext): void {
  if (actor.role !== "ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Requiere rol ADMIN u OPERATOR");
  }
}

export function requireMentorOrAbove(actor: ActorContext): void {
  // ADMIN, OPERATOR, MENTOR pueden escribir. VIEWER no.
  if (actor.role === "VIEWER") {
    throw new ForbiddenError("Sin permiso de escritura");
  }
}
