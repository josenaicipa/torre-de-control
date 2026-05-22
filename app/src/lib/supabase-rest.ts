// Server-side Supabase PostgREST export client.
//
// This legacy helper is used only by scripts/backfill-dashboard-rds.ts to read
// old Supabase rows during explicit migration/backfill runs. It must never be
// imported by browser code, and it has no hardcoded fallback credentials: the
// operator must provide env vars at runtime.

function baseUrl(): string {
  const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new SupabaseRestError("supabase-url-missing", 500);
  return value.replace(/\/+$/, "");
}

function anonKey(): string {
  const value = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new SupabaseRestError("supabase-anon-key-missing", 500);
  return value;
}

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SupabaseRestError";
  }
}

async function rest(path: string, init: RequestInit): Promise<Response> {
  const key = anonKey();
  const res = await fetch(`${baseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  return res;
}

async function readBody(res: Response): Promise<unknown[]> {
  const text = await res.text();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  // Surface only a generic, table-agnostic message to avoid leaking schema or
  // key details. Status is enough for the caller to map to an HTTP response.
  throw new SupabaseRestError("supabase-rest-error", res.status);
}

/** SELECT rows. `search` is a raw PostgREST query string (already encoded). */
export async function restSelect(table: string, search = "select=*"): Promise<unknown[]> {
  const res = await rest(`${table}?${search}`, { method: "GET" });
  await ensureOk(res);
  return readBody(res);
}

/** UPSERT (insert or merge on conflict). Returns nothing. */
export async function restUpsert(
  table: string,
  values: Record<string, unknown>,
  onConflict?: string,
): Promise<void> {
  const qs = onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : "";
  const res = await rest(`${table}${qs ? `?${qs}` : ""}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(values),
  });
  await ensureOk(res);
}

/** INSERT a row and return the inserted representation. */
export async function restInsert(
  table: string,
  values: Record<string, unknown>,
): Promise<unknown[]> {
  const res = await rest(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(values),
  });
  await ensureOk(res);
  return readBody(res);
}

/**
 * DELETE rows matching equality filters. `filters` keys are column names and
 * values are matched with `eq.`. Refuses to run with an empty filter set so a
 * bug can never wipe a whole table.
 */
export async function restDelete(
  table: string,
  filters: Record<string, string | number>,
): Promise<void> {
  const keys = Object.keys(filters);
  if (keys.length === 0) {
    throw new SupabaseRestError("refusing-unfiltered-delete", 400);
  }
  const search = keys
    .map((k) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(String(filters[k]))}`)
    .join("&");
  const res = await rest(`${table}?${search}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  await ensureOk(res);
}

/**
 * Build a PostgREST `in.(...)` filter for the given column. Each value is
 * double-quoted (so spaces are safe) and URL-encoded; the comma delimiters and
 * quote characters stay literal so PostgREST parses the list correctly.
 */
export function inFilter(column: string, values: readonly string[]): string {
  const list = values.map((v) => `%22${encodeURIComponent(v)}%22`).join(",");
  return `${encodeURIComponent(column)}=in.(${list})`;
}
