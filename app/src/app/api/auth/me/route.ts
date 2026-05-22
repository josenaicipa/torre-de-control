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

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Autenticación no disponible: base de datos no configurada" },
      { status: 503 },
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, email: true, name: true, role: true, permissions: true, active: true },
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
    return NextResponse.json(
      { error: "Autenticación no disponible" },
      { status: 503 },
    );
  }
}
