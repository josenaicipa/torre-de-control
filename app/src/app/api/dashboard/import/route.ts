import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { dashboardImport, DashboardStoreError, type ImportTables } from "@/lib/dashboard-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secret(): string | null {
  const value = process.env.AUTH_SECRET;
  return value && value.length >= 16 ? value : null;
}

function verifySignature(body: string, header: string | null): boolean {
  const key = secret();
  if (!key || !header) return false;
  const expected = `sha256=${crypto.createHmac("sha256", key).update(body).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function hasSessionImportAccess(): Promise<boolean> {
  const result = await getDashboardActor();
  if (!result) return false;
  const access = resolveDashboardAccess(result.actor);
  return access.isGlobalData && access.canWrite;
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const signed = verifySignature(bodyText, req.headers.get("x-torre-import-signature"));
  const sessionAllowed = signed ? false : await hasSessionImportAccess();
  if (!signed && !sessionAllowed) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const tables = (parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { tables?: unknown }).tables
    : null) as ImportTables | null;

  if (!tables || typeof tables !== "object" || Array.isArray(tables)) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  try {
    const counts = await dashboardImport(tables);
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    const status = error instanceof DashboardStoreError ? error.status : 500;
    return NextResponse.json({ error: "Importación falló" }, { status });
  }
}
