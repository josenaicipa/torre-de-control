#!/usr/bin/env node
// One-shot production import for DailyMetric rows baked into the image.
// Conservative: only upserts DailyMetric + SourceSnapshot; never touches users,
// commercial notes, or other manual/human tables.
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const DATA_PATH = process.env.TORRE_DAILY_IMPORT_PATH || "scripts/daily-import.json";
const SOURCE = "torre-v2-daily-import";

function summarize(rows) {
  return {
    rows: rows.length,
    first_date: rows[0]?.date ?? null,
    last_date: rows.at(-1)?.date ?? null,
    channels: [...new Set(rows.map((r) => r.channel))].sort(),
    totals: rows.reduce(
      (acc, r) => {
        acc.spend += Number(r.spend || 0);
        acc.booked += Number(r.booked || 0);
        acc.showed += Number(r.showed || 0);
        acc.closed += Number(r.closed || 0);
        acc.revenue += Number(r.revenue || 0);
        return acc;
      },
      { spend: 0, booked: 0, showed: 0, closed: 0, revenue: 0 },
    ),
  };
}

async function main() {
  if (process.env.IMPORT_DAILY_METRICS_ON_START !== "1") {
    console.log("[daily-import] not enabled — skipping");
    return;
  }
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`[daily-import] data file not found: ${DATA_PATH}`);
  }
  const bytes = fs.readFileSync(DATA_PATH);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const rows = JSON.parse(bytes.toString("utf8"));
  const summary = summarize(rows);
  summary.sha256 = hash;

  const prisma = new PrismaClient();
  try {
    const before = await prisma.dailyMetric.count();
    console.log(`[daily-import] starting rows=${rows.length} existing=${before} hash=${hash.slice(0, 12)}`);

    for (const row of rows) {
      await prisma.dailyMetric.upsert({
        where: { date_channel: { date: new Date(`${row.date}T00:00:00.000Z`), channel: row.channel } },
        create: {
          date: new Date(`${row.date}T00:00:00.000Z`),
          channel: row.channel,
          spend: row.spend,
          booked: row.booked,
          showed: row.showed,
          closed: row.closed,
          revenue: row.revenue,
          raw: row.raw ?? undefined,
        },
        update: {
          spend: row.spend,
          booked: row.booked,
          showed: row.showed,
          closed: row.closed,
          revenue: row.revenue,
          raw: row.raw ?? undefined,
        },
      });
    }

    await prisma.sourceSnapshot.upsert({
      where: { source_hash: { source: SOURCE, hash } },
      create: { source: SOURCE, sourceDate: new Date(), hash, rawSummary: summary },
      update: { rawSummary: summary },
    });

    const after = await prisma.dailyMetric.aggregate({
      _count: true,
      _sum: { spend: true, booked: true, showed: true, closed: true, revenue: true },
      _min: { date: true },
      _max: { date: true },
    });
    console.log("[daily-import] completed", JSON.stringify({ before, after }, (_, v) => typeof v === "bigint" ? Number(v) : v));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[daily-import] failed", error?.message || error);
  process.exit(1);
});
