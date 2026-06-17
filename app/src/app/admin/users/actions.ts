"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  canManageUsers,
  parsePosition,
  parseScope,
} from "@/lib/permissions";
import { menuAccessToPermissions, normalizeMenuAccess, resolveUserPermissions } from "@/lib/menu-access";
import { prisma } from "@/lib/prisma";
import { normalizeAreaForSelectedTeam } from "@/lib/user-scope-normalization";

function parseRole(value: FormDataEntryValue | null): Role {
  if (value === "ADMIN" || value === "OPERATOR" || value === "MENTOR" || value === "VIEWER") return value;
  return "VIEWER";
}

// Trim a form value; empty -> null so optional relations/fields clear cleanly.
function optionalString(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface ScopedFields {
  position: ReturnType<typeof parsePosition>;
  dataScope: ReturnType<typeof parseScope>;
  areaId: string | null;
  teamId: string | null;
  managerId: string | null;
  ghlUserId: string | null;
  ghlUserEmail: string | null;
  ghlUserName: string | null;
  isCollector: boolean;
}

function readScopedFields(formData: FormData): ScopedFields {
  const ghlUserEmail = optionalString(formData.get("ghlUserEmail"));
  return {
    position: parsePosition(formData.get("position")),
    dataScope: parseScope(formData.get("dataScope")),
    areaId: optionalString(formData.get("areaId")),
    teamId: optionalString(formData.get("teamId")),
    managerId: optionalString(formData.get("managerId")),
    ghlUserId: optionalString(formData.get("ghlUserId")),
    ghlUserEmail: ghlUserEmail ? ghlUserEmail.toLowerCase() : null,
    ghlUserName: optionalString(formData.get("ghlUserName")),
    isCollector: formData.get("isCollector") === "on" || formData.get("isCollector") === "true",
  };
}

// Validate that referenced area/team/manager actually exist. Avoids opaque FK
// errors and prevents pointing a user at a non-existent (or self) manager.
// If an operator selects a team, the team is the source of truth for area: this
// keeps the form forgiving instead of crashing when Área/Equipo are mismatched.
async function normalizeScopedReferences(fields: ScopedFields, selfId: string | null): Promise<ScopedFields> {
  const normalized = { ...fields };

  if (normalized.areaId) {
    const area = await prisma.area.findUnique({ where: { id: normalized.areaId }, select: { id: true } });
    if (!area) throw new Error("El área seleccionada no existe");
  }
  if (normalized.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: normalized.teamId },
      select: { id: true, areaId: true },
    });
    if (!team) throw new Error("El equipo seleccionado no existe");
    normalized.areaId = normalizeAreaForSelectedTeam(normalized.areaId, team.areaId);
  }
  if (normalized.managerId) {
    if (normalized.managerId === selfId) throw new Error("Un usuario no puede ser su propio responsable");
    const manager = await prisma.user.findUnique({ where: { id: normalized.managerId }, select: { id: true } });
    if (!manager) throw new Error("El responsable seleccionado no existe");
  }

  return normalized;
}

async function assertCollectorAvailable(
  tx: Prisma.TransactionClient,
  isCollector: boolean,
  excludeUserId?: string,
) {
  if (!isCollector) return;
  const existing = await tx.user.findFirst({
    where: {
      isCollector: true,
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { email: true },
  });
  if (existing) {
    throw new Error(`Ya hay otro usuario marcado como encargado de cobro: ${existing.email}`);
  }
}

async function requireUserAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  const actor = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, permissions: true, active: true },
  });
  if (!actor?.active || !canManageUsers(actor.role, actor.permissions)) redirect("/dashboard");
  return actor;
}

export async function createUserAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = parseRole(formData.get("role"));
  let scoped = readScopedFields(formData);
  const selected = menuAccessToPermissions(normalizeMenuAccess(formData.getAll("menuAccess")));

  if (!email || !email.includes("@")) throw new Error("Correo inválido");
  if (password.length < 10) throw new Error("La contraseña temporal debe tener mínimo 10 caracteres");
  scoped = await normalizeScopedReferences(scoped, null);
  const permissions = resolveUserPermissions(role, selected);

  await prisma.$transaction(async (tx) => {
    await assertCollectorAvailable(tx, scoped.isCollector);
    await tx.user.create({
      data: {
        email,
        name: name || null,
        passwordHash: hashPassword(password),
        role,
        permissions,
        active: true,
        position: scoped.position,
        dataScope: scoped.dataScope,
        areaId: scoped.areaId,
        teamId: scoped.teamId,
        managerId: scoped.managerId,
        ghlUserId: scoped.ghlUserId,
        ghlUserEmail: scoped.ghlUserEmail,
        ghlUserName: scoped.ghlUserName,
        isCollector: scoped.isCollector,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "user.created",
        target: email,
        metadata: {
          role,
          permissions,
          position: scoped.position,
          dataScope: scoped.dataScope,
          areaId: scoped.areaId,
          teamId: scoped.teamId,
          managerId: scoped.managerId,
          ghlUserId: scoped.ghlUserId,
          isCollector: scoped.isCollector,
        },
      },
    });
  });
  revalidatePath("/admin/users");
}

export async function updateOwnProfileAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  // Self-service is limited to identity + own GHL mapping; never scope/position.
  const ghlUserId = optionalString(formData.get("ghlUserId"));
  const ghlUserEmailRaw = optionalString(formData.get("ghlUserEmail"));
  const ghlUserEmail = ghlUserEmailRaw ? ghlUserEmailRaw.toLowerCase() : null;
  const ghlUserName = optionalString(formData.get("ghlUserName"));

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Correo inválido");
  if (password || passwordConfirm) {
    if (password.length < 10) throw new Error("La nueva contraseña debe tener mínimo 10 caracteres");
    if (password !== passwordConfirm) throw new Error("Las contraseñas no coinciden");
  }

  const isCollectorRaw = formData.get("isCollector");
  const wantCollector = isCollectorRaw === "on" || isCollectorRaw === "true";

  await prisma.$transaction(async (tx) => {
    await assertCollectorAvailable(tx, wantCollector, actor.id);
    const updated = await tx.user.update({
      where: { id: actor.id },
      data: {
        email,
        name: name || null,
        ghlUserId,
        ghlUserEmail,
        ghlUserName,
        isCollector: wantCollector,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
      select: { email: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: password ? "user.password_updated" : "user.profile_updated",
        target: updated.email,
        metadata: { self: true, ghlUserId, isCollector: wantCollector },
      },
    });
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const role = parseRole(formData.get("role"));
  let scoped = readScopedFields(formData);
  const permissions = resolveUserPermissions(
    role,
    menuAccessToPermissions(normalizeMenuAccess(formData.getAll("menuAccess"))),
  );
  if (!id || id === actor.id) return;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Correo inválido");
  if (password || passwordConfirm) {
    if (password.length < 10) throw new Error("La nueva contraseña debe tener mínimo 10 caracteres");
    if (password !== passwordConfirm) throw new Error("Las contraseñas no coinciden");
  }
  scoped = await normalizeScopedReferences(scoped, id);
  const effectivePermissions = permissions;

  await prisma.$transaction(async (tx) => {
    await assertCollectorAvailable(tx, scoped.isCollector, id);
    const target = await tx.user.update({
      where: { id },
      data: {
        email,
        name: name || null,
        role,
        permissions: effectivePermissions,
        position: scoped.position,
        dataScope: scoped.dataScope,
        areaId: scoped.areaId,
        teamId: scoped.teamId,
        managerId: scoped.managerId,
        ghlUserId: scoped.ghlUserId,
        ghlUserEmail: scoped.ghlUserEmail,
        ghlUserName: scoped.ghlUserName,
        isCollector: scoped.isCollector,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
      select: { email: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: password ? "user.access_updated" : "user.profile_updated",
        target: target.email,
        metadata: {
          role,
          permissions: effectivePermissions,
          position: scoped.position,
          dataScope: scoped.dataScope,
          areaId: scoped.areaId,
          teamId: scoped.teamId,
          managerId: scoped.managerId,
          ghlUserId: scoped.ghlUserId,
          isCollector: scoped.isCollector,
        },
      },
    });
  });
  revalidatePath("/admin/users");
}

export async function toggleUserStatusAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id || id === actor.id) return;

  const target = await prisma.user.update({
    where: { id },
    data: { active },
    select: { email: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      action: active ? "user.reactivated" : "user.suspended",
      target: target.email,
    },
  });
  revalidatePath("/admin/users");
}
