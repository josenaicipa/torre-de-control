import { NextResponse } from "next/server";
import { ALL_PERMISSIONS, canManageUsers, POSITION_LABELS, SCOPE_LABELS } from "@/lib/permissions";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { summarizeEffectiveAccess } from "@/lib/effective-access-summary";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { actor } = result;
  if (!canManageUsers(actor.role, [...actor.permissions])) {
    return NextResponse.json({ error: "Sin permisos para ver resumen de usuarios" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      active: true,
      position: true,
      dataScope: true,
      area: { select: { name: true } },
      team: { select: { name: true } },
      manager: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    users: users.map((user) => {
      const permissions = user.role === "ADMIN" ? [...ALL_PERMISSIONS] : user.permissions;
      const summary = summarizeEffectiveAccess({
        role: user.role,
        position: user.position,
        dataScope: user.dataScope,
        permissions,
        areaName: user.area?.name ?? null,
        teamName: user.team?.name ?? null,
        managerName: user.manager?.name ?? user.manager?.email ?? null,
      });

      return {
        id: user.id,
        name: user.name || user.email,
        email: user.email,
        active: user.active,
        role: user.role,
        positionLabel: POSITION_LABELS[user.position],
        dataScopeLabel: SCOPE_LABELS[user.dataScope],
        summary,
      };
    }),
  });
}
