"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import {
  canManageUsers,
  defaultPermissionsForPosition,
  normalizePermissions,
  parsePosition,
  parseScope,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
  };
}

// Validate that referenced area/team/manager actually exist. Avoids opaque FK
// errors and prevents pointing a user at a non-existent (or self) manager.
async function assertScopedReferences(fields: ScopedFields, selfId: string | null): Promise<void> {
  if (fields.areaId) {
    const area = await prisma.area.findUnique({ where: { id: fields.areaId }, select: { id: true } });
    if (!area) throw new Error("El área seleccionada no existe");
  }
  if (fields.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: fields.teamId },
      select: { id: true, areaId: true },
    });
    if (!team) throw new Error("El equipo seleccionado no existe");
    // A team must not be paired with a different area than the one it belongs to.
    if (fields.areaId && team.areaId !== fields.areaId) {
      throw new Error("El equipo seleccionado pertenece a otra área");
    }
  }
  if (fields.managerId) {
    if (fields.managerId === selfId) throw new Error("Un usuario no puede ser su propio responsable");
    const manager = await prisma.user.findUnique({ where: { id: fields.managerId }, select: { id: true } });
    if (!manager) throw new Error("El responsable seleccionado no existe");
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
  const scoped = readScopedFields(formData);
  const selected = normalizePermissions(formData.getAll("permissions"));
  const permissions = selected.length > 0 ? selected : defaultPermissionsForPosition(scoped.position);

  if (!email || !email.includes("@")) throw new Error("Correo inválido");
  if (password.length < 10) throw new Error("La contraseña temporal debe tener mínimo 10 caracteres");
  await assertScopedReferences(scoped, null);

  await prisma.$transaction([
    prisma.user.create({
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
      },
    }),
    prisma.auditEvent.create({
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
        },
      },
    }),
  ]);
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

  const updated = await prisma.user.update({
    where: { id: actor.id },
    data: {
      email,
      name: name || null,
      ghlUserId,
      ghlUserEmail,
      ghlUserName,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
    select: { email: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      action: password ? "user.password_updated" : "user.profile_updated",
      target: updated.email,
      metadata: { self: true, ghlUserId },
    },
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const id = String(formData.get("id") ?? "");
  const role = parseRole(formData.get("role"));
  const scoped = readScopedFields(formData);
  const permissions = normalizePermissions(formData.getAll("permissions"));
  if (!id || id === actor.id) return;
  await assertScopedReferences(scoped, id);

  const target = await prisma.user.update({
    where: { id },
    data: {
      role,
      permissions: permissions.length > 0 ? permissions : defaultPermissionsForPosition(scoped.position),
      position: scoped.position,
      dataScope: scoped.dataScope,
      areaId: scoped.areaId,
      teamId: scoped.teamId,
      managerId: scoped.managerId,
      ghlUserId: scoped.ghlUserId,
      ghlUserEmail: scoped.ghlUserEmail,
      ghlUserName: scoped.ghlUserName,
    },
    select: { email: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "user.permissions_updated",
      target: target.email,
      metadata: {
        role,
        permissions,
        position: scoped.position,
        dataScope: scoped.dataScope,
        areaId: scoped.areaId,
        teamId: scoped.teamId,
        managerId: scoped.managerId,
        ghlUserId: scoped.ghlUserId,
      },
    },
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
