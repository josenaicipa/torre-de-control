import { NextResponse } from "next/server";
import { getDailyMetrics } from "@/lib/daily-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getDailyMetrics();
  return NextResponse.json(data);
}
