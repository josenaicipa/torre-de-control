#!/usr/bin/env node
// Runs `prisma generate` resiliently.
//
// `prisma generate` requires DATABASE_URL to be *defined* (the schema uses
// env("DATABASE_URL")) even though it never connects. So fresh installs or CI
// steps that run before env setup would fail. We inject a harmless placeholder
// only when the var is absent. This never prints or uses a real secret and
// never touches a database.
import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.DATABASE_URL) {
  env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";
}

const result = spawnSync("prisma", ["generate"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  console.error("[prisma-generate] failed to spawn prisma:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
