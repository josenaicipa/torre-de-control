import { PrismaClient } from "@prisma/client";

// Singleton across hot reloads in dev. Import this lazily from callers that may
// run without a configured database so construction is deferred until needed.
const globalForPrisma = globalThis as unknown as {
  __torrePrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__torrePrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__torrePrisma = prisma;
}
