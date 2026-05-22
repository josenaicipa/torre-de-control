import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID = "Correo o contraseña inválidos";
const CORPORATE_DOMAIN = "naicipa.com";
const LEGACY_DOMAIN = "unlockedecom.co";

function legacyEmailForCorporate(email: string): string | null {
  const suffix = `@${CORPORATE_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  const localPart = email.slice(0, -suffix.length);
  return localPart ? `${localPart}@${LEGACY_DOMAIN}` : null;
}

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Autenticación no disponible: base de datos no configurada" },
      { status: 503 },
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    let user = await prisma.user.findUnique({ where: { email } });
    let migrateToEmail: string | null = null;

    if (!user) {
      const legacyEmail = legacyEmailForCorporate(email);
      if (legacyEmail) {
        user = await prisma.user.findUnique({ where: { email: legacyEmail } });
        if (user) migrateToEmail = email;
      }
    }

    // Always run a verification to keep timing roughly constant even when the
    // user does not exist.
    const stored =
      user?.passwordHash ??
      "scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
    const ok = verifyPassword(password, stored);

    if (!user || !user.active || !ok) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    if (migrateToEmail) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { email: migrateToEmail },
        });
        await prisma.auditEvent.create({
          data: {
            actorId: user.id,
            action: "user.email_migrated",
            target: migrateToEmail,
            metadata: { fromDomain: LEGACY_DOMAIN, toDomain: CORPORATE_DOMAIN },
          },
        });
      } catch {
        return NextResponse.json(
          { error: "Ese correo corporativo ya existe. Entra con tu correo anterior y cámbialo desde Admin." },
          { status: 409 },
        );
      }
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json({
      ok: true,
      user: { email: user.email, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch {
    return NextResponse.json(
      { error: "Autenticación no disponible" },
      { status: 503 },
    );
  }
}
