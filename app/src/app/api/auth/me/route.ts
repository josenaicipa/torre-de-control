import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.role === "ADMIN") {
    return NextResponse.json({
      user: {
        email: session.email,
        role: session.role,
        permissions: [],
        canManageUsers: true,
      },
    });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { email: true, name: true, role: true, permissions: true, active: true },
      });

      if (!user?.active) {
        return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });
      }

      return NextResponse.json({
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          canManageUsers: canManageUsers(user.role, user.permissions),
        },
      });
    } catch {
      // Fall through to the session-only response below.
    }
  }

  return NextResponse.json({
    user: {
      email: session.email,
      role: session.role,
      permissions: [],
      canManageUsers: false,
    },
  });
}
