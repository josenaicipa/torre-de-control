import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import {
  canManageUsers,
  defaultPermissionsForPosition,
  OPERATIONAL_POSITIONS,
  DATA_SCOPES,
  PERMISSION_GROUPS,
  POSITION_LABELS,
  SCOPE_LABELS,
} from "@/lib/permissions";
import { PERMISSION_PRESETS } from "@/lib/permission-presets";
import { summarizeEffectiveAccess } from "@/lib/effective-access-summary";
import { prisma } from "@/lib/prisma";
import { OperationsShell } from "@/app/operaciones/operations-shell";
import { createUserAction, toggleUserStatusAction, updateOwnProfileAction, updateUserAction } from "./actions";

export const dynamic = "force-dynamic";

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  OPERATOR: "Operador",
  MENTOR: "Mentor",
  VIEWER: "Visualizador",
};

const ADMIN_NAV_ITEMS = [
  { href: "/operaciones/estudiantes", label: "Estudiantes" },
  { href: "/operaciones/cartera", label: "Cartera" },
  { href: "/operaciones/mentores", label: "Mentores" },
  { href: "/operaciones/importar", label: "Importar Excel" },
  { href: "/admin/users", label: "Usuarios y permisos" },
];

interface OptionItem {
  id: string;
  label: string;
}

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

function PositionSelect({ value }: { value?: string }) {
  return (
    <select name="position" defaultValue={value ?? "VIEWER"}>
      {OPERATIONAL_POSITIONS.map((position) => (
        <option key={position} value={position}>{POSITION_LABELS[position]}</option>
      ))}
    </select>
  );
}

function ScopeSelect({ value }: { value?: string }) {
  return (
    <select name="dataScope" defaultValue={value ?? "OWN"}>
      {DATA_SCOPES.map((scope) => (
        <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>
      ))}
    </select>
  );
}

function RelationSelect({
  name,
  value,
  placeholder,
  options,
}: {
  name: string;
  value?: string | null;
  placeholder: string;
  options: OptionItem[];
}) {
  return (
    <select name={name} defaultValue={value ?? ""}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  );
}

export default async function UsersAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const actor = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      role: true,
      permissions: true,
      active: true,
      email: true,
      name: true,
      ghlUserId: true,
      ghlUserEmail: true,
      ghlUserName: true,
      isCollector: true,
    },
  });
  if (!actor?.active || !canManageUsers(actor.role, actor.permissions)) redirect("/dashboard");

  const [users, areas, teams] = await Promise.all([
    prisma.user.findMany({
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
        position: true,
        dataScope: true,
        areaId: true,
        teamId: true,
        managerId: true,
        ghlUserId: true,
        ghlUserEmail: true,
        ghlUserName: true,
        isCollector: true,
        area: { select: { name: true } },
        team: { select: { name: true } },
        manager: { select: { name: true, email: true } },
      },
    }),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.team.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, area: { select: { name: true } } },
    }),
  ]);

  const areaOptions: OptionItem[] = areas.map((area) => ({ id: area.id, label: area.name }));
  const teamOptions: OptionItem[] = teams.map((team) => ({
    id: team.id,
    label: team.area ? `${team.name} · ${team.area.name}` : team.name,
  }));
  const managerOptions: OptionItem[] = users
    .filter((user) => user.active && (user.position === "DIRECTOR" || user.position === "ADMIN"))
    .map((user) => ({ id: user.id, label: user.name || user.email }));
  return (
    <OperationsShell
      actor={{ email: actor.email, role: actor.role }}
      navItems={ADMIN_NAV_ITEMS}
      title="Usuarios y permisos"
      eyebrow="Administración · Torre de Control"
    >
      <div className="space-y-6">

      <h1 className="page-title">Usuarios y permisos</h1>
      <p className="muted">
        Crea accesos, asigna cargo y alcance de datos (amarrado a GHL) y ajusta permisos por módulo. Los usuarios no se
        borran: se suspenden para conservar auditoría.
      </p>

      <section className="card admin-section">
        <h2>Mi usuario</h2>
        <p className="muted">Usa el correo corporativo de Naicipa para iniciar sesión y administrar accesos. Puedes mapear tu propia identidad de GHL aquí.</p>
        <form action={updateOwnProfileAction} className="admin-form">
          <div className="form-grid">
            <div className="field"><label>Nombre</label><input name="name" defaultValue={actor.name ?? ""} placeholder="Nombre completo" /></div>
            <div className="field"><label>Correo</label><input name="email" type="email" required defaultValue={actor.email} placeholder="jose@naicipa.com" /></div>
            <div className="field"><label>Nueva contraseña</label><input name="password" type="password" minLength={10} autoComplete="new-password" placeholder="déjalo vacío para no cambiar" /></div>
            <div className="field"><label>Confirmar contraseña</label><input name="passwordConfirm" type="password" minLength={10} autoComplete="new-password" placeholder="repite la nueva contraseña" /></div>
            <div className="field"><label>GHL User ID</label><input name="ghlUserId" defaultValue={actor.ghlUserId ?? ""} placeholder="ID de usuario en GHL" /></div>
            <div className="field"><label>GHL Email</label><input name="ghlUserEmail" type="email" defaultValue={actor.ghlUserEmail ?? ""} placeholder="correo en GHL" /></div>
            <div className="field"><label>GHL Nombre</label><input name="ghlUserName" defaultValue={actor.ghlUserName ?? ""} placeholder="nombre en GHL" /></div>
            <div className="field">
              <label>Encargado de cobro</label>
              <label className="checkbox-row">
                <input type="checkbox" name="isCollector" defaultChecked={actor.isCollector} />
                <span>Recibo recordatorios y reportes de cartera</span>
              </label>
            </div>
          </div>
          <button className="btn secondary" type="submit">Actualizar mi usuario</button>
        </form>
      </section>

      <section className="card admin-section">
        <h2>Crear usuario</h2>
        <p className="muted">Elige una plantilla para crear accesos rápido; luego puedes ajustar área, equipo, GHL y permisos puntuales si hace falta.</p>
        <form action={createUserAction} className="admin-form">
          <fieldset className="permission-group">
            <legend>Tipo de usuario</legend>
            <p className="muted">Elige una plantilla. El servidor aplicará rol, cargo, alcance y permisos de forma consistente.</p>
            <div className="permission-grid">
              {PERMISSION_PRESETS.map((preset) => (
                <label className="checkbox-row" key={preset.id}>
                  <input
                    type="radio"
                    name="permissionPreset"
                    value={preset.id}
                    defaultChecked={preset.id === "solo-lectura"}
                  />
                  <span><strong>{preset.label}</strong><br />{preset.description}</span>
                </label>
              ))}
              <label className="checkbox-row">
                <input type="radio" name="permissionPreset" value="manual" />
                <span><strong>Manual avanzado</strong><br />Usa exactamente el rol, cargo, alcance y permisos seleccionados abajo.</span>
              </label>
            </div>
          </fieldset>
          <div className="form-grid">
            <div className="field"><label>Nombre</label><input name="name" placeholder="Nombre completo" /></div>
            <div className="field"><label>Correo</label><input name="email" type="email" required placeholder="usuario@naicipa.com" /></div>
            <div className="field"><label>Rol</label><select name="role" defaultValue="VIEWER">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="field"><label>Cargo</label><PositionSelect value="VIEWER" /></div>
            <div className="field"><label>Alcance</label><ScopeSelect value="OWN" /></div>
            <div className="field"><label>Área</label><RelationSelect name="areaId" placeholder="Sin área" options={areaOptions} /></div>
            <div className="field"><label>Equipo</label><RelationSelect name="teamId" placeholder="Sin equipo" options={teamOptions} /></div>
            <div className="field"><label>Responsable / Director</label><RelationSelect name="managerId" placeholder="Sin responsable" options={managerOptions} /></div>
            <div className="field"><label>GHL User ID</label><input name="ghlUserId" placeholder="ID de usuario en GHL" /></div>
            <div className="field"><label>GHL Email</label><input name="ghlUserEmail" type="email" placeholder="correo en GHL" /></div>
            <div className="field"><label>GHL Nombre</label><input name="ghlUserName" placeholder="nombre en GHL" /></div>
            <div className="field"><label>Contraseña temporal</label><input name="password" type="password" required minLength={10} placeholder="mín. 10 caracteres" /></div>
            <div className="field">
              <label>Encargado de cobro</label>
              <label className="checkbox-row">
                <input type="checkbox" name="isCollector" />
                <span>Recibe recordatorios y reportes de cartera</span>
              </label>
            </div>
          </div>
          <PermissionCheckboxes selected={defaultPermissionsForPosition("VIEWER")} />
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
                <p className="muted">Cargo: {POSITION_LABELS[user.position]} · Alcance: {SCOPE_LABELS[user.dataScope]}</p>
                <p className="muted">GHL: {user.ghlUserId ? user.ghlUserId : "sin mapear"}{user.ghlUserName ? ` (${user.ghlUserName})` : ""}</p>
                <p className="muted">Cartera: {user.isCollector ? "Encargado de cobro" : "No"}</p>
                <p className="muted">Permisos: {user.permissions.length ? user.permissions.join(", ") : "por cargo"}</p>
                {(() => {
                  const accessSummary = summarizeEffectiveAccess({
                    role: user.role,
                    position: user.position,
                    dataScope: user.dataScope,
                    permissions: user.permissions.length ? user.permissions : defaultPermissionsForPosition(user.position),
                    areaName: user.area?.name ?? null,
                    teamName: user.team?.name ?? null,
                    managerName: user.manager?.name ?? user.manager?.email ?? null,
                  });
                  return (
                    <div className="access-summary">
                      <strong>Alcance efectivo</strong>
                      <p className="muted">{accessSummary.scopeLabel}</p>
                      <p className="muted">{accessSummary.description}</p>
                      <div className="permission-grid">
                        {accessSummary.badges.map((badge) => (
                          <span className="pill" key={badge}>{badge}</span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <p className="muted">Último acceso: {user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "nunca"}</p>
              </div>
              <form action={updateUserAction} className="inline-admin-form">
                <input type="hidden" name="id" value={user.id} />
                <div className="compact-grid">
                  <label className="compact-field">Rol<select name="role" defaultValue={user.role}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="compact-field">Cargo<PositionSelect value={user.position} /></label>
                  <label className="compact-field">Alcance<ScopeSelect value={user.dataScope} /></label>
                  <label className="compact-field">Área<RelationSelect name="areaId" value={user.areaId} placeholder="Sin área" options={areaOptions} /></label>
                  <label className="compact-field">Equipo<RelationSelect name="teamId" value={user.teamId} placeholder="Sin equipo" options={teamOptions} /></label>
                  <label className="compact-field">Responsable<RelationSelect name="managerId" value={user.managerId} placeholder="Sin responsable" options={managerOptions.filter((option) => option.id !== user.id)} /></label>
                  <label className="compact-field">GHL User ID<input name="ghlUserId" defaultValue={user.ghlUserId ?? ""} placeholder="ID en GHL" /></label>
                  <label className="compact-field">GHL Email<input name="ghlUserEmail" type="email" defaultValue={user.ghlUserEmail ?? ""} placeholder="correo en GHL" /></label>
                  <label className="compact-field">GHL Nombre<input name="ghlUserName" defaultValue={user.ghlUserName ?? ""} placeholder="nombre en GHL" /></label>
                  <label className="compact-field">
                    Encargado de cobro
                    <span className="checkbox-row" style={{ marginTop: 4 }}>
                      <input type="checkbox" name="isCollector" defaultChecked={user.isCollector} />
                      <span>Cobra</span>
                    </span>
                  </label>
                </div>
                <PermissionCheckboxes selected={user.permissions.length ? user.permissions : defaultPermissionsForPosition(user.position)} />
                <button className="btn secondary" type="submit" disabled={user.id === session.sub}>Guardar configuración</button>
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
      </div>
    </OperationsShell>
  );
}
