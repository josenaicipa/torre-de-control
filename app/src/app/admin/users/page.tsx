import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { canManageUsers, defaultPermissionsForRole, PERMISSION_GROUPS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { createUserAction, toggleUserStatusAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  OPERATOR: "Operador",
  VIEWER: "Viewer",
};

function PermissionCheckboxes({ selected }: { selected: string[] }) {
  return (
    <div className="permission-grid">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset className="permission-group" key={group.id}>
          <legend>{group.label}</legend>
          {group.permissions.map((permission) => (
            <label className="checkbox-row" key={permission.id}>
              <input
                type="checkbox"
                name="permissions"
                value={permission.id}
                defaultChecked={selected.includes(permission.id)}
              />
              <span>{permission.label}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

export default async function UsersAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const actor = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { role: true, permissions: true, active: true, email: true },
  });
  if (!actor?.active || !canManageUsers(actor.role, actor.permissions)) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <main className="container wide">
      <div className="topbar">
        <span className="brand">Torre de Control · Admin</span>
        <div className="top-actions">
          <a className="btn secondary" href="/dashboard">Dashboard</a>
          <span className="muted">{actor.email}</span>
          <LogoutButton />
        </div>
      </div>

      <h1 className="page-title">Usuarios y permisos</h1>
      <p className="muted">
        Crea accesos, asigna rol y ajusta permisos por módulo. Los usuarios no se borran: se suspenden para conservar auditoría.
      </p>

      <section className="card admin-section">
        <h2>Crear usuario</h2>
        <form action={createUserAction} className="admin-form">
          <div className="form-grid">
            <div className="field"><label>Nombre</label><input name="name" placeholder="Nombre completo" /></div>
            <div className="field"><label>Correo</label><input name="email" type="email" required placeholder="usuario@unlockedecom.co" /></div>
            <div className="field"><label>Rol</label><select name="role" defaultValue="VIEWER">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>Contraseña temporal</label><input name="password" type="password" required minLength={10} placeholder="mín. 10 caracteres" /></div>
          </div>
          <PermissionCheckboxes selected={defaultPermissionsForRole("VIEWER")} />
          <button className="btn" type="submit">Crear acceso</button>
        </form>
      </section>

      <section className="admin-section">
        <h2>Accesos existentes</h2>
        <div className="user-list">
          {users.map((user) => (
            <article className={`card user-row ${user.active ? "" : "is-suspended"}`} key={user.id}>
              <div>
                <strong>{user.name || user.email}</strong>
                <p className="muted">{user.email} · {roleLabels[user.role]} · {user.active ? "Activo" : "Suspendido"}</p>
                <p className="muted">Permisos: {user.permissions.length ? user.permissions.join(", ") : "por rol"}</p>
                <p className="muted">Último acceso: {user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "nunca"}</p>
              </div>
              <form action={updateUserAction} className="inline-admin-form">
                <input type="hidden" name="id" value={user.id} />
                <label className="compact-field">Rol<select name="role" defaultValue={user.role}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <PermissionCheckboxes selected={user.permissions.length ? user.permissions : defaultPermissionsForRole(user.role)} />
                <button className="btn secondary" type="submit" disabled={user.id === session.sub}>Guardar permisos</button>
              </form>
              <form action={toggleUserStatusAction}>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="active" value={String(!user.active)} />
                <button className="btn secondary danger" type="submit" disabled={user.id === session.sub}>{user.active ? "Suspender" : "Reactivar"}</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
