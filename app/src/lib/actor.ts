/**
 * Resolves shared auth context for Operaciones routes and server components.
 * Authorization remains domain-specific; this loader only reads fresh DB state.
 */
import { prisma } from "./prisma";
import { getSession } from "./auth";
import type { DataScope, OperationalPosition, Role } from "@prisma/client";

export interface ActorContext {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  position: OperationalPosition;
  dataScope: DataScope;
  permissions: string[];
  areaId: string | null;
  teamId: string | null;
  ghlUserName: string | null;
  mentorId: string | null;
  isCollector: boolean;
}

export async function getActor(): Promise<ActorContext | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      position: true,
      dataScope: true,
      permissions: true,
      areaId: true,
      teamId: true,
      ghlUserName: true,
      isCollector: true,
    },
  });
  if (!user || !user.active) return null;

  let mentorId: string | null = null;
  if (user.role === "MENTOR") {
    const mentor = await prisma.mentor.findUnique({
      where: { userId: user.id },
      select: { id: true, active: true },
    });
    if (mentor?.active) mentorId = mentor.id;
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    position: user.position,
    dataScope: user.dataScope,
    permissions: user.permissions,
    areaId: user.areaId,
    teamId: user.teamId,
    ghlUserName: user.ghlUserName,
    mentorId,
    isCollector: user.isCollector,
  };
}

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
  if (actor.role === "VIEWER") {
    throw new ForbiddenError("Sin permiso de escritura");
  }
}

export function hasOperacionesPermission(actor: ActorContext, permission: string): boolean {
  return actor.role === "ADMIN" || actor.permissions.includes(permission);
}
