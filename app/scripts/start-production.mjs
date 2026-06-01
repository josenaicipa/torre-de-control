#!/usr/bin/env node
// Production startup for the Dockerized app (App Runner + RDS target).
//
// 1. Run `prisma migrate deploy` *only* when DATABASE_URL is configured, so the
//    container schema matches the code before serving traffic. We never print
//    the value — only whether it is configured.
// 2. Start Next.js on the configured PORT and forward signals so the platform
//    can shut the container down gracefully.
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const PORT = process.env.PORT || "3000";

// Placeholder injected by prisma-generate.mjs for offline `prisma generate`.
// Never treat it as a real, migratable database.
const PLACEHOLDER_DATABASE_URL =
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

function databaseIsConfigured() {
  const url = process.env.DATABASE_URL;
  return Boolean(url) && url !== PLACEHOLDER_DATABASE_URL;
}

function runMigrations() {
  console.log("[start-production] DATABASE_URL configured — running prisma migrate deploy");
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  if (result.error) {
    console.error("[start-production] failed to spawn prisma:", result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 0) !== 0) {
    console.error(`[start-production] prisma migrate deploy exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function runAdminBootstrap() {
  if (!process.env.TORRE_ADMIN_EMAIL && !process.env.TORRE_ADMIN_PASSWORD) {
    console.log("[start-production] admin bootstrap not configured — skipping");
    return;
  }
  console.log("[start-production] admin bootstrap configured — creating/updating admin");
  const result = spawnSync("node", ["scripts/create-admin-runtime.mjs"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  if (result.error) {
    console.error("[start-production] failed to spawn admin bootstrap:", result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 0) !== 0) {
    console.error(`[start-production] admin bootstrap exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function runDailyImport() {
  if (process.env.IMPORT_DAILY_METRICS_ON_START !== "1") {
    console.log("[start-production] daily metrics import not enabled — skipping");
    return;
  }
  console.log("[start-production] daily metrics import enabled — importing production exports");
  const result = spawnSync("node", ["scripts/import-daily-metrics.mjs"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  if (result.error) {
    console.error("[start-production] failed to spawn daily metrics import:", result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 0) !== 0) {
    console.error(`[start-production] daily metrics import exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function runAutoAdSpendSync() {
  console.log("[start-production] syncing Auto Ads spend from metrics");
  const result = spawnSync("node", ["scripts/sync-auto-ad-spend.mjs"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  if (result.error) {
    console.error("[start-production] failed to spawn Auto Ads sync:", result.error.message);
    return;
  }
  if ((result.status ?? 0) !== 0) {
    console.error(`[start-production] Auto Ads sync exited with code ${result.status}; continuing startup`);
  }
}

function runPaymentTransactionsImport() {
  if (process.env.IMPORT_PAYMENT_TRANSACTIONS_ON_START !== "1") {
    console.log("[start-production] payment transaction import not enabled — skipping");
    return;
  }
  console.log("[start-production] payment transaction import enabled — importing cash ledger");
  const result = spawnSync("node", ["scripts/import-payment-transactions.mjs"], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  if (result.error) {
    console.error("[start-production] failed to spawn payment transaction import:", result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 0) !== 0) {
    console.error(`[start-production] payment transaction import exited with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function startNext() {
  console.log(`[start-production] starting Next.js on port ${PORT}`);
  const child = spawn("next", ["start", "-p", PORT], {
    stdio: "inherit",
    env: process.env,
    shell: isWindows,
  });

  const forward = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  child.on("error", (error) => {
    console.error("[start-production] failed to spawn next:", error.message);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

if (databaseIsConfigured()) {
  runMigrations();
  runAdminBootstrap();
  runAutoAdSpendSync();
  runDailyImport();
  runPaymentTransactionsImport();
} else {
  console.log("[start-production] DATABASE_URL not configured — skipping migrations, admin bootstrap, and daily import");
}

startNext();
