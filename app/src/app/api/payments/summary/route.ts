import { NextResponse, type NextRequest } from "next/server";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { getMonthlyCashSummary } from "@/lib/payment-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/payments/summary?year=2026&month=5  (month is 1-12)
//
// Returns Cash Collected totals + drill-down transaction lists for one month.
//
// FAIL-CLOSED: the payment ledger is company-wide cash truth with no per-member
// scope column, so — exactly like the other aggregate dashboard tables — only
// global users (admins / DataScope ALL) may read it. Scoped users get 403 rather
// than leaking aggregate transactions. 401 when there is no active session.
export async function GET(req: NextRequest) {
  const result = await getDashboardActor();
  if (!result) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const access = resolveDashboardAccess(result.actor);
  if (!access.canRead) {
    return NextResponse.json({ error: "Sin permiso de lectura" }, { status: 403 });
  }
  if (!access.isGlobalData) {
    return NextResponse.json(
      { error: "Acceso restringido a la verdad de pagos" },
      { status: 403 },
    );
  }

  const now = new Date();
  const year = parseIntParam(req.nextUrl.searchParams.get("year"), now.getUTCFullYear());
  const month = parseIntParam(req.nextUrl.searchParams.get("month"), now.getUTCMonth() + 1);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Año inválido" }, { status: 400 });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  }

  try {
    const summary = await getMonthlyCashSummary(year, month);
    if (!summary) {
      // No database configured: report no data rather than failing the dashboard.
      return NextResponse.json({
        available: false,
        year,
        month,
        reason: "no-database",
      });
    }
    return NextResponse.json({ available: true, ...summary });
  } catch (error) {
    console.error("payments.summary.failed", {
      year,
      month,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Error de datos de pagos" }, { status: 500 });
  }
}

function parseIntParam(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
