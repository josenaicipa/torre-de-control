import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionPayload,
  verifySessionToken,
} from "./session";

// Server-side session helpers for route handlers and server components.
// Node runtime only (uses next/headers cookies()).

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // SameSite=None allows the cookie inside a cross-site iframe, as required
    // when Operaciones is embedded from the legacy command center.
    // Local development uses Lax because None also requires HTTPS.
    sameSite:
      process.env.NODE_ENV === "production"
        ? ("none" as const)
        : ("lax" as const),
    path: "/",
    maxAge,
  };
}
