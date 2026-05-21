import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Public API routes that must remain reachable without a session.
const PUBLIC_API = new Set<string>([
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith("/api");
  const isDashboard = pathname.startsWith("/dashboard");

  if (isApi && PUBLIC_API.has(pathname)) {
    return NextResponse.next();
  }

  if (!isApi && !isDashboard) {
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

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
