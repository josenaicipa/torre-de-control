// Dashboard authorization: turns an active DB user into a concrete access
// decision for the dashboard data API.
//
// FAIL-CLOSED CONTRACT (do not weaken):
//   - Read access to the Torre/Detalle dashboard is broad by product rule:
//     every active user with dashboard.read can view saved Detalle rows.
//   - Global mutation access (every table, every row) requires admin OR
//     DataScope ALL.
//   - Aggregate tables (kpi_data, ads_entries, daily_closer) have no per-member
//     column, so non-global users can never write them.
//   - daily_entries is the only table with safe row-level write scope, via its
//     `member` column. Non-global users only ever modify members that map to
//     their own identity (OWN) or their area/team (DIRECTOR).
//   - Anything unrecognized resolves to an empty member set => no rows.
//
// This module is pure and deterministic so it can be fully unit-tested without a
// database or network.

import type { DataScope, OperationalPosition } from "@prisma/client";

// Collaborator catalog mirrored from public/index.html. The dashboard stores the
// daily_entries `member` column under any of these aliases (canonical id,
// display label, or a legacy short id), so a user's allowed-member set must
// include every alias for the collaborators they own.
interface Collaborator {
  readonly id: string;
  readonly label: string;
  readonly legacy?: string;
  readonly role: "closer" | "setter" | "marketing";
}

const COLLABORATORS: readonly Collaborator[] = [
  { id: "Karen", label: "Karen Anquiz", role: "marketing" },
  { id: "Luisa", label: "Luisa Vega", role: "marketing" },
  { id: "Valen", label: "Valen", role: "marketing" },
  { id: "Carlos", label: "Carlos Velez", role: "marketing" },
  { id: "Dahiana", label: "Dahiana", role: "marketing" },
  { id: "Otro", label: "Otro", role: "marketing" },
  { id: "Admin", label: "Valentina Sanchez", role: "closer" },
  { id: "Alejandro Gallo", label: "Alejandro Gallo", role: "setter" },
  { id: "Daniel Garcia", label: "Daniel Garcia", role: "setter" },
  { id: "Luisa Vega", label: "Luisa Vega", role: "setter" },
  { id: "Lucas Soria", label: "Lucas Soria", role: "setter" },
  { id: "Carlos Velez", label: "Carlos Velez", legacy: "Carlos", role: "closer" },
  { id: "Daryi Perez", label: "Daryi Perez", legacy: "Daryi", role: "closer" },
  { id: "Wiston Quintero", label: "Wiston Quintero", legacy: "Juan Diego Afanador", role: "closer" },
  { id: "Daniel Garcia Closer", label: "Daniel Garcia", legacy: "Daniel Garcia", role: "closer" },
  { id: "Alejandro Gallo Closer", label: "Alejandro Gallo", legacy: "Alejandro Gallo", role: "closer" },
];

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function aliasesOf(c: Collaborator): string[] {
  return uniq(c.legacy ? [c.id, c.label, c.legacy] : [c.id, c.label]);
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function emailLocalPart(email: string | null | undefined): string {
  const at = (email ?? "").indexOf("@");
  return at > 0 ? (email ?? "").slice(0, at) : "";
}

function membersForRole(role: Collaborator["role"]): string[] {
  return COLLABORATORS.filter((c) => c.role === role).flatMap(aliasesOf);
}

/**
 * Resolve the member aliases a single user owns, by matching their identity
 * (ghlUserName, name, or email local-part) against the collaborator catalog for
 * the given role. Returns every alias of the matched collaborator, or [] if no
 * exact match — never a broad fallback.
 */
function membersForIdentity(actor: DashboardActor, role: Collaborator["role"]): string[] {
  const candidates = new Set<string>(
    [norm(actor.ghlUserName), norm(actor.name), norm(emailLocalPart(actor.email))].filter(Boolean),
  );
  if (candidates.size === 0) return [];

  for (const c of COLLABORATORS) {
    if (c.role !== role) continue;
    const matches = aliasesOf(c).some((a) => candidates.has(norm(a)));
    if (matches) return aliasesOf(c);
  }
  return [];
}

/**
 * Resolve the member set for a DIRECTOR scoped to an area/team. Only acts when
 * the area/team name unambiguously identifies a function:
 *   Ventas / Comercial / Closers  => commercial collaborators
 *   Setters                       => setter collaborators
 *   Marketing                     => marketing collaborators (Karen)
 * Anything else => [] (no rows), by design.
 */
function membersForGroup(areaName: string | null, teamName: string | null): string[] {
  const hay = `${areaName ?? ""} ${teamName ?? ""}`.toLowerCase();
  const isCommercial = /\b(vent|comerc|clos)/.test(hay);
  const isSetter = /\bsetter/.test(hay);
  const isMarketing = /\bmarket/.test(hay);
  // If a name somehow matches both keywords, refuse rather than guess.
  const matches = [isCommercial, isSetter, isMarketing].filter(Boolean).length;
  if (matches !== 1) return [];
  if (isCommercial) return membersForRole("closer");
  if (isSetter) return membersForRole("setter");
  if (isMarketing) return membersForRole("marketing");
  return [];
}

export interface DashboardActor {
  readonly role: string; // Prisma Role as string ("ADMIN" | "OPERATOR" | "VIEWER")
  readonly permissions: readonly string[];
  readonly position: OperationalPosition;
  readonly dataScope: DataScope;
  readonly name: string | null;
  readonly email: string;
  readonly ghlUserName: string | null;
  readonly areaName: string | null;
  readonly teamName: string | null;
}

export interface DashboardAccess {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  /** Admin or DataScope ALL: every table, every row for mutations. */
  readonly isGlobalData: boolean;
  /** Allowed daily_entries member aliases (empty when global or when none). */
  readonly allowedMembers: readonly string[];
  /** Short machine-readable explanation, useful for diagnostics and the UI. */
  readonly reason: string;
}

export function isAdmin(actor: Pick<DashboardActor, "role" | "position">): boolean {
  return actor.role === "ADMIN" || actor.position === "ADMIN";
}

export function canReadDashboard(actor: DashboardActor): boolean {
  // A mentor requires an explicit ADMIN position to reach commercial data,
  // even if old permission grants remain stored on the user.
  if (actor.role === "MENTOR" && actor.position !== "ADMIN") return false;
  return isAdmin(actor) || actor.permissions.includes("dashboard.read");
}

export function canWriteDashboard(actor: DashboardActor): boolean {
  if (actor.role === "MENTOR" && actor.position !== "ADMIN") return false;
  return isAdmin(actor) || actor.permissions.includes("dashboard.write");
}

/** Derive the daily_entries member aliases a non-global user may touch. */
export function deriveAllowedMembers(actor: DashboardActor): string[] {
  switch (actor.position) {
    case "CLOSER":
      return actor.dataScope === "OWN" ? membersForIdentity(actor, "closer") : [];
    case "SETTER":
      return actor.dataScope === "OWN" ? membersForIdentity(actor, "setter") : [];
    case "DIRECTOR":
      return actor.dataScope === "AREA" || actor.dataScope === "TEAM"
        ? membersForGroup(actor.areaName, actor.teamName)
        : [];
    default:
      // ADMIN handled by global path; VIEWER and anything else get no rows.
      return [];
  }
}

/** Resolve the full dashboard access decision for an active user. */
export function resolveDashboardAccess(actor: DashboardActor): DashboardAccess {
  const canRead = canReadDashboard(actor);
  const canWrite = canWriteDashboard(actor);
  const isGlobalData = isAdmin(actor) || actor.dataScope === "ALL";

  if (isGlobalData) {
    return { canRead, canWrite, isGlobalData: true, allowedMembers: [], reason: "global" };
  }

  const allowedMembers = deriveAllowedMembers(actor);
  return {
    canRead,
    canWrite,
    isGlobalData: false,
    allowedMembers,
    reason: allowedMembers.length > 0 ? "scoped-members" : "no-rows",
  };
}

/** Is `member` within this user's allowed set? Global users may touch any member. */
export function isMemberAllowed(access: DashboardAccess, member: unknown): boolean {
  if (access.isGlobalData) return true;
  if (typeof member !== "string") return false;
  return access.allowedMembers.includes(member);
}

/**
 * Can this actor fill the manual daily_entries row for this exact collaborator?
 * This is intentionally narrower than dashboard.write: it only matches the
 * user's own identity against the active collaborator catalog and is used for the
 * "Llenar reporte" flow so operators can fill their own Detalle row even when they are not broad dashboard writers.
 */
export function isOwnDashboardEntryMember(
  actor: Pick<DashboardActor, "ghlUserName" | "name" | "email">,
  member: unknown,
): boolean {
  if (typeof member !== "string" || !member.trim()) return false;
  const candidates = new Set<string>(
    [norm(actor.ghlUserName), norm(actor.name), norm(emailLocalPart(actor.email))].filter(Boolean),
  );
  if (candidates.size === 0) return false;

  for (const c of COLLABORATORS) {
    const aliases = aliasesOf(c);
    const identityMatches = aliases.some((a) => candidates.has(norm(a)));
    if (identityMatches && aliases.includes(member)) return true;
  }
  return false;
}
