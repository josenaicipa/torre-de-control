import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing with Node's built-in scrypt. No external dependency.
// Stored format: `scrypt$<saltHex>$<hashHex>`. Node-runtime only.

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCHEME = "scrypt";

export function hashPassword(password: string): string {
  if (!password) {
    throw new Error("Cannot hash an empty password");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `${SCHEME}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [scheme, saltHex, hashHex] = parts;
  if (scheme !== SCHEME || !saltHex || !hashHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const derived = scryptSync(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
