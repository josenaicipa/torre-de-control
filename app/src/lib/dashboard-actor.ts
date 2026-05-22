import { getSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/session";
import type { DashboardActor } from "@/lib/dashboard-access";

// Loads the *active* database user behind the current session and shapes it into
// a DashboardActor for the access layer. We never trust the session role alone:
// permissions, position, data scope and area/team are always read fresh from the
// database so a suspended or downgraded user loses access immediately.

export interface ActorResult {
  session: SessionPayload;
  actor: DashboardActor;
}

// Fallback used only when no database is configured (e.g. a stripped-down
// environment). A genuine ADMIN session still gets global access; everyone else
// fails closed with no permissions.
function actorFromSession(session: SessionPayload): DashboardActor | null {
  if (session.role !== "ADMIN") return null;
  return {
    role: "ADMIN",
    permissions: [],
    position: "ADMIN",
    dataScope: "ALL",
    name: null,
    email: session.email,
    ghlUserName: null,
    areaName: null,
    teamName: null,
  };
}

export async function getDashboardActor(): Promise<ActorResult | null> {
  const session = await getSession();
  if (!session) return null;

  if (!process.env.DATABASE_URL) {
    const actor = actorFromSession(session);
    return actor ? { session, actor } : null;
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        email: true,
        name: true,
        role: true,
        permissions: true,
        active: true,
        position: true,
        dataScope: true,
        ghlUserName: true,
        area: { select: { name: true } },
        team: { select: { name: true } },
      },
    });

    if (!user || !user.active) return null;

    const actor: DashboardActor = {
      role: user.role,
      permissions: user.permissions,
      position: user.position,
      dataScope: user.dataScope,
      name: user.name,
      email: user.email,
      ghlUserName: user.ghlUserName,
      areaName: user.area?.name ?? null,
      teamName: user.team?.name ?? null,
    };
    return { session, actor };
  } catch {
    // Database unreachable: fall back to session-only (admin -> global, else null).
    const actor = actorFromSession(session);
    return actor ? { session, actor } : null;
  }
}
