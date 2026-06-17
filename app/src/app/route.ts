import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { resolveLandingPath } from "@/lib/post-login-redirect";

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
// resolve dashboard access per request: users with read access -- or with
// operaciones.read -- get the shell so navigation respects the permission table.
// Authenticated users without any shell access are sent to the surface they
// *can* use (via resolveLandingPath) instead of bouncing back to /login; only
// anonymous sessions fall through to the login screen.
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
  if (!actorResult) {
    const loginUrl = safeAbsoluteUrl(req, "/login");
    loginUrl.searchParams.set("next", "/");
    return Response.redirect(loginUrl, 302);
  }

  if (!canReadDashboardShell(actorResult)) {
    // Authenticated but cannot read the shell (no dashboard.read and no
    // operaciones.read): route them to the first surface their permissions
    // allow. resolveLandingPath never returns "/" here, so this cannot loop
    // back into the shell.
    const target = resolveLandingPath(actorResult.actor);
    return Response.redirect(safeAbsoluteUrl(req, target), 302);
  }

  const html = await readFile(join(process.cwd(), "public", "index.html"), "utf8");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
