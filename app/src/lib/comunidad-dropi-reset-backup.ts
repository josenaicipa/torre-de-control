/**
 * Server-only helpers for the Comunidad Dropi reset backup file.
 *
 * Kept apart from comunidad-dropi-reset.ts because that module is also imported
 * by the client ResetPanel; pulling node:fs/node:os/node:path in there would
 * break the browser bundle.
 *
 * In production (ECS/Fargate, Next standalone) the app directory is read-only,
 * so the backup must never land under app/backups. It goes to RESET_BACKUP_DIR
 * when set, otherwise the OS temp dir (/tmp on Linux).
 */

import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResetTableName } from "./comunidad-dropi-reset";

type BackupEnv = Record<string, string | undefined>;

export function resolveBackupDir(env: BackupEnv = process.env): string {
  const configured = env.RESET_BACKUP_DIR?.trim();
  if (configured) return configured;
  return path.join(os.tmpdir(), "comunidad-dropi-backups");
}

/**
 * JSON.stringify replacer that keeps Prisma values from breaking serialization:
 * BigInt throws by default, and Decimal is rendered via its string form rather
 * than as an opaque object. Date already serializes to an ISO string via toJSON.
 */
export function backupReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (isDecimalLike(value)) return value.toString();
  return value;
}

function isDecimalLike(
  value: unknown,
): value is { toString(): string } {
  return (
    typeof value === "object" &&
    value !== null &&
    value.constructor?.name === "Decimal"
  );
}

export function serializeBackup(data: Record<ResetTableName, unknown[]>): string {
  return JSON.stringify(data, backupReplacer, 2);
}

/**
 * Writes the backup to disk and returns the absolute file path. Throws if the
 * directory cannot be created or the file cannot be written, so callers can
 * abort the reset before deleting anything.
 */
export async function writeBackupFile(
  data: Record<ResetTableName, unknown[]>,
  env: BackupEnv = process.env,
): Promise<string> {
  const dir = resolveBackupDir(env);
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `comunidad-dropi-reset-${stamp}.json`);
  await writeFile(file, serializeBackup(data), "utf8");
  return file;
}
