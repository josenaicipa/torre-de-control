#!/usr/bin/env node
// Runtime-safe admin bootstrap for production containers.
// Reads password from TORRE_ADMIN_PASSWORD only; never logs the value.
import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function hashPassword(password) {
  if (!password) throw new Error("Cannot hash an empty password");
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function fail(message) {
  console.error(`[create-admin-runtime] ${message}`);
  process.exit(1);
}

const email = process.env.TORRE_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.TORRE_ADMIN_NAME?.trim() || undefined;
const password = process.env.TORRE_ADMIN_PASSWORD;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail("TORRE_ADMIN_EMAIL must be a valid email");
}
if (!password || password.length < 10) {
  fail("TORRE_ADMIN_PASSWORD must be at least 10 characters");
}
if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set");
}

const prisma = new PrismaClient();
try {
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
      active: true,
      name,
    },
    create: {
      email,
      name: name ?? null,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });
  console.log(`[create-admin-runtime] Admin ready: ${user.email} (role=${user.role})`);
} finally {
  await prisma.$disconnect();
}
