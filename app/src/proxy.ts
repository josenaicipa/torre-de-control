import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Next.js 16 registers route guards from `proxy.ts` at the app/src root.
// This file is the coarse session gate for the dashboard shell and APIs.
//
// Coarse gate only: it verifies a valid signed session exists. Fine-grained
// authorization (active DB user, permissions, data scope) is enforced inside the
// Node route handlers, which can talk to the database. Middleware runs on the
// Edge runtime and must stay DB-free.

// API routes that must remain reachable without a session.
const PUBLIC_API = new Set<string>([
  "/api/health",
  "/api/health/deep",
  "/api/dashboard/import",
  "/api/auth/login",
  "/api/auth/logout",
]);

function isPublic(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/")) return PUBLIC_API.has(pathname);
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

// Protect the dashboard root, the legacy /dashboard path, and every API route.
// Static assets (/_next, /logo.png, fonts, favicon) are not listed and stay
// public so the login page and shell can load.
export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/api/:path*"],
};
