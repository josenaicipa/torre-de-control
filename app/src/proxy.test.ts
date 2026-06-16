import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// proxy.ts imports `@/lib/session` and `next/server`, which pull in the Next.js
// Edge middleware runtime and the `@/*` path alias. Neither resolves under the
// plain Node vitest environment, so we guard the public-route policy by reading
// the source statically instead of importing the module.
const source = readFileSync(resolve(__dirname, "proxy.ts"), "utf8");

describe("proxy public-route gate", () => {
  it("keeps the dynamic contract signing route public via a trailing-slash prefix", () => {
    expect(source).toContain('"/api/contratos/firmar/"');
  });

  it("matches public prefixes with startsWith so the trailing slash is meaningful", () => {
    // With startsWith and the trailing slash, only /api/contratos/firmar/<token>
    // is public; /api/contratos and /api/contratos/firmar are not.
    expect(source).toContain(
      "PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))",
    );
  });

  it("does not open the whole /api/contratos namespace", () => {
    // A bare entry/prefix without the `firmar/` token segment would make every
    // /api/contratos* route public.
    expect(source).not.toContain('"/api/contratos"');
    expect(source).not.toContain('"/api/contratos/"');
    expect(source).not.toContain('"/api/contratos/crear"');
  });
});
