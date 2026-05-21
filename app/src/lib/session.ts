// Stateless signed session token, runtime-agnostic (Web Crypto).
// Works in both the Edge middleware and Node route handlers.
//
// Token format: base64url(payloadJson) + "." + base64url(HMAC-SHA256(payload)).
// The cookie is HttpOnly; the signature prevents tampering. No DB lookup needed
// to validate a request, which keeps middleware cheap and deterministic.

export const SESSION_COOKIE = "torre_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface SessionPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is not set or too short. Set a strong AUTH_SECRET (>= 16 chars).",
    );
  }
  return secret;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  input: Pick<SessionPayload, "sub" | "email" | "role">,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: input.sub,
    email: input.email,
    role: input.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadPart) as BufferSource,
  );
  return `${payloadPart}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let valid: boolean;
  try {
    const key = await importKey();
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sigPart) as BufferSource,
      encoder.encode(payloadPart) as BufferSource,
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const json = decoder.decode(base64UrlToBytes(payloadPart));
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
