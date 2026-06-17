import type { OperationalPosition, Role } from "@prisma/client";

// Decide where an authenticated user should land based on their *real* stored
// permissions, so nobody is dumped on a page they cannot read. This mirrors the
// read gate in dashboard-access (the MENTOR/ADMIN rules and the dashboard.read
// requirement) so login and the root route agree on the destination.
//
//   "/"                            -> Torre shell (needs dashboard.read or ADMIN)
//   "/operaciones/mis-estudiantes" -> mentors (own students only)
//   "/operaciones"                 -> operations module (operaciones.read)
//   "/admin/users"                 -> user admins without dashboard access
//   "/login"                       -> no usable permission (fail-safe)

export interface LandingActor {
  readonly role: Role | string;
  readonly position: OperationalPosition | string;
  readonly permissions: readonly string[];
}

export function resolveLandingPath(actor: LandingActor): string {
  const isAdmin = actor.role === "ADMIN" || actor.position === "ADMIN";
  const perms = new Set(actor.permissions);

  // A mentor without an ADMIN position only ever works on their own students,
  // even if stale dashboard grants remain on the record.
  if (actor.role === "MENTOR" && actor.position !== "ADMIN") {
    return "/operaciones/mis-estudiantes";
  }
  if (isAdmin || perms.has("dashboard.read")) return "/";
  if (perms.has("operaciones.read")) return "/operaciones";
  if (perms.has("users.read") || perms.has("users.create") || perms.has("users.update")) {
    return "/admin/users";
  }
  return "/login";
}
