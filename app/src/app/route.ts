import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";

// The dashboard shell (public/index.html) is gated by middleware, but we also
// check the session here as defense-in-depth: if middleware is ever bypassed or
// misconfigured, the root must still refuse to serve the app to anonymous users.
// Must be dynamic (not force-static) so the per-request session check runs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actorResult = await getDashboardActor();
  const access = actorResult ? resolveDashboardAccess(actorResult.actor) : null;
  if (!access?.canRead) {
    const loginUrl = new URL("/login", req.url);
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
