import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Expire the cookie immediately.
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
