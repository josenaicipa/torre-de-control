import { NextResponse } from "next/server";
import { canManageUsers, ALL_PERMISSIONS, SCOPE_LABELS, POSITION_LABELS } from "@/lib/permissions";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { isAdmin, resolveDashboardAccess } from "@/lib/dashboard-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Identity + capabilities for the browser dashboard. The frontend uses this to
// decide what to show (admin link, scope banner) — it is NOT the authorization
// boundary. Every data route re-derives access from the DB user independently.
export async function GET() {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { actor } = result;
  const admin = isAdmin(actor);
  const access = resolveDashboardAccess(actor);
  // Admins implicitly hold every permission; otherwise report what's stored.
  const permissions = admin ? [...ALL_PERMISSIONS] : [...actor.permissions];

  const scopeSummary = access.isGlobalData
    ? "Acceso a todos los datos"
    : access.allowedMembers.length > 0
      ? `Acceso limitado a: ${access.allowedMembers.join(", ")}`
      : "Sin datos asignados a tu alcance";

  return NextResponse.json({
    user: {
      email: actor.email,
      name: actor.name,
      role: actor.role,
      permissions,
      canManageUsers: canManageUsers(actor.role, permissions),
      position: actor.position,
      positionLabel: POSITION_LABELS[actor.position],
      dataScope: actor.dataScope,
      dataScopeLabel: SCOPE_LABELS[actor.dataScope],
      area: actor.areaName,
      team: actor.teamName,
      ghlUserName: actor.ghlUserName,
      capabilities: {
        canRead: access.canRead,
        canWrite: access.canWrite,
        isGlobalData: access.isGlobalData,
        allowedMembers: access.allowedMembers,
        scopeSummary,
      },
    },
  });
}
