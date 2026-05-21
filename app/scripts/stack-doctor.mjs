#!/usr/bin/env node
// Stack doctor: verifies the local environment is ready without ever printing
// secret values. Reports presence (SET / MISSING) only.
import process from "node:process";

const MIN_NODE_MAJOR = 20;

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

const required = ["DATABASE_URL", "AUTH_SECRET"];
const optional = ["ADMIN_BOOTSTRAP_TOKEN", "TORRE_ADMIN_PASSWORD"];

let hardFail = false;

console.log("Torre de Control — stack doctor");
console.log("--------------------------------");

// Node version
const major = nodeMajor();
if (major >= MIN_NODE_MAJOR) {
  console.log(`[ok]   Node ${process.versions.node} (>= ${MIN_NODE_MAJOR})`);
} else {
  console.error(`[fail] Node ${process.versions.node} is too old (need >= ${MIN_NODE_MAJOR})`);
  hardFail = true;
}

// Required env presence (never print values)
console.log("");
console.log("Required environment variables:");
for (const key of required) {
  const present = Boolean(process.env[key]);
  console.log(`  ${present ? "[ok]  " : "[warn]"} ${key}: ${present ? "SET" : "MISSING"}`);
}

if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 16) {
  console.log("  [warn] AUTH_SECRET is set but shorter than 16 chars — use a longer value");
}

console.log("");
console.log("Optional environment variables:");
for (const key of optional) {
  const present = Boolean(process.env[key]);
  console.log(`  [info] ${key}: ${present ? "SET" : "unset"}`);
}

console.log("");
if (hardFail) {
  console.error("Doctor: FAILED (fix the [fail] items above).");
  process.exit(1);
}

const missingRequired = required.filter((k) => !process.env[k]);
if (missingRequired.length > 0) {
  console.log(
    `Doctor: OK with warnings. Set ${missingRequired.join(", ")} before running the app (copy app/.env.example to app/.env).`,
  );
} else {
  console.log("Doctor: OK. Environment looks ready.");
}
process.exit(0);
