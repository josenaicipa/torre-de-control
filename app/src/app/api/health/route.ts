import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness/readiness probe. Reports presence of required config as booleans
// only — never the values themselves.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "torre-de-control-v2",
    time: new Date().toISOString(),
    node: process.version,
    config: {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    },
  });
}
