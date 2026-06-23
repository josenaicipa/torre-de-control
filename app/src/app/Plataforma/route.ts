import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Serve the canonical legacy control surface at /Plataforma as well as the
// static /Plataforma/index.html file. Several team bookmarks omit index.html;
// without this route Next returns its app 404 instead of the public folder file.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const html = await readFile(join(process.cwd(), "public", "Plataforma", "index.html"), "utf8");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
