"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { canManageUsers, defaultPermissionsForRole, normalizePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function parseRole(value: FormDataEntryValue | null): Role {
  if (value === "ADMIN" || value === "OPERATOR" || value === "VIEWER") return value;
  return "VIEWER";
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
  const selected = normalizePermissions(formData.getAll("permissions"));
  const permissions = selected.length > 0 ? selected : defaultPermissionsForRole(role);

  if (!email || !email.includes("@")) throw new Error("Correo inválido");
  if (password.length < 10) throw new Error("La contraseña temporal debe tener mínimo 10 caracteres");

  await prisma.$transaction([
    prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash: hashPassword(password),
        role,
        permissions,
        active: true,
      },
    }),
    prisma.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "user.created",
        target: email,
        metadata: { role, permissions },
      },
    }),
  ]);
  revalidatePath("/admin/users");
}

export async function updateOwnProfileAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Correo inválido");

  const updated = await prisma.user.update({
    where: { id: actor.id },
    data: { email, name: name || null },
    select: { email: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "user.profile_updated",
      target: updated.email,
      metadata: { self: true },
    },
  });
  revalidatePath("/admin/users");
}

export async function updateUserAction(formData: FormData) {
  const actor = await requireUserAdmin();
  const id = String(formData.get("id") ?? "");
  const role = parseRole(formData.get("role"));
  const permissions = normalizePermissions(formData.getAll("permissions"));
  if (!id || id === actor.id) return;

  const target = await prisma.user.update({
    where: { id },
    data: { role, permissions: permissions.length > 0 ? permissions : defaultPermissionsForRole(role) },
    select: { email: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "user.permissions_updated",
      target: target.email,
      metadata: { role, permissions },
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
