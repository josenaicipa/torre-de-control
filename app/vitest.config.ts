import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the TypeScript "@/*" path alias at runtime so tests can import modules
// (e.g. API route handlers) that use the alias internally. The `^@\/` pattern
// only matches the project alias and never scoped npm packages like
// "@prisma/client".
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${srcDir}/` }],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
