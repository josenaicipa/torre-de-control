import { getSession } from "@/lib/auth";
import type { DashboardActor } from "@/lib/dashboard-access";

// Loads the *active* database user behind the current session and shapes it into
// a DashboardActor for the access layer. We never trust the session role alone:
// permissions, position, data scope and area/team are always read fresh from the
// database so a suspended or downgraded user loses access immediately.

export interface ActorResult {
  userId: string;
  actor: DashboardActor;
}

export async function getDashboardActor(): Promise<ActorResult | null> {
  const session = await getSession();
  if (!session) return null;

  if (!process.env.DATABASE_URL) {
    return null;
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
    return { userId: session.sub, actor };
  } catch {
    // Database unreachable: fail closed. Session claims alone are not enough to
    // prove the user is still active or still has the same permissions/scope.
    return null;
  }
}
