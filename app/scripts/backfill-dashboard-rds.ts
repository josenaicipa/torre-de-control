import crypto from "node:crypto";
import { restSelect } from "../src/lib/supabase-rest";

const TABLES = ["kpi_data", "daily_entries", "ads_entries", "daily_closer"] as const;
const target = process.env.TORRE_IMPORT_URL || "https://control.unlockedecom.co/api/dashboard/import";

function sign(body: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function main() {
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows = await restSelect(table, "select=*");
    tables[table] = rows;
  }

  const body = JSON.stringify({ tables });
  const signature = sign(body);
  if (!signature) {
    throw new Error("AUTH_SECRET is required in env to sign the import request");
  }

  const res = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-torre-import-signature": signature,
    },
    body,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { body: text.slice(0, 120) };
  }

  const exportedCounts = Object.fromEntries(TABLES.map((table) => [table, tables[table].length]));
  console.log(JSON.stringify({ ok: res.ok, status: res.status, exportedCounts, response: parsed }, null, 2));
  if (!res.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "backfill-failed" }));
  process.exit(1);
});
