import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getSession } from "@/lib/auth";

// The dashboard shell (public/index.html) is gated by middleware, but we also
// check the session here as defense-in-depth: if middleware is ever bypassed or
// misconfigured, the root must still refuse to serve the app to anonymous users.
// Must be dynamic (not force-static) so the per-request session check runs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
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
