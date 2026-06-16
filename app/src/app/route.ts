import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";

function safeAbsoluteUrl(req: Request, path: string): URL {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    return new URL(path, `${proto}://${host}`);
  }
  return new URL(path, req.url);
}

// The root serves the legacy dashboard shell (public/index.html), which exposes
// the full Torre menu (CEO / comercial / opciones) gated by permissions. We
// resolve dashboard access per request: users with read access get the shell so
// navigation respects the permission table; everyone else goes to /login as
// defense-in-depth in case middleware is ever bypassed or misconfigured.
// Must be dynamic (not force-static) so the per-request session check runs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canReadDashboardShell(actorResult: Awaited<ReturnType<typeof getDashboardActor>>): boolean {
  if (!actorResult) return false;
  const access = resolveDashboardAccess(actorResult.actor);
  return access.canRead || actorResult.actor.permissions.includes("operaciones.read");
}

export async function GET(req: Request) {
  const actorResult = await getDashboardActor();
  if (!canReadDashboardShell(actorResult)) {
    const loginUrl = safeAbsoluteUrl(req, "/login");
    loginUrl.searchParams.set("next", "/");
    return Response.redirect(loginUrl, 302);
  }

  const html = await readFile(join(process.cwd(), "public", "index.html"), "utf8");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
