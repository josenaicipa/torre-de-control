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

// The root used to serve the legacy dashboard shell (public/index.html), but
// that shell loads React/Babel from unpkg at runtime and can render a blank
// page in production. The modern Operaciones app lives under Next routes, so we
// redirect authenticated users there instead of serving the legacy HTML.
// Anonymous users (no read access) still go to /login as defense-in-depth in
// case middleware is ever bypassed or misconfigured.
// Must be dynamic (not force-static) so the per-request session check runs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actorResult = await getDashboardActor();
  const access = actorResult ? resolveDashboardAccess(actorResult.actor) : null;
  if (!access?.canRead) {
    const loginUrl = safeAbsoluteUrl(req, "/login");
    loginUrl.searchParams.set("next", "/");
    return Response.redirect(loginUrl, 302);
  }

  return Response.redirect(safeAbsoluteUrl(req, "/operaciones"), 302);
}
