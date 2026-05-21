// Create or update an ADMIN user safely.
//
// Usage:
//   TORRE_ADMIN_PASSWORD='...' npm run user:create-admin -- --email you@example.com [--name "Your Name"]
//   npm run user:create-admin -- --email you@example.com           (prompts for password, hidden)
//
// The password is NEVER read from argv (it would leak into shell history and
// process listings). It comes from TORRE_ADMIN_PASSWORD or an interactive,
// masked prompt.
import process from "node:process";
import { hashPassword } from "../src/lib/password.js";

interface Args {
  email?: string;
  name?: string;
}

const KEY_ENTER = "\r";
const KEY_NEWLINE = "\n";
const KEY_EOT = String.fromCharCode(4); // Ctrl-D
const KEY_ETX = String.fromCharCode(3); // Ctrl-C
const KEY_DEL = String.fromCharCode(127); // Delete
const KEY_BS = "\b"; // Backspace

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--email") args.email = argv[++i];
    else if (token === "--name") args.name = argv[++i];
    else if (token.startsWith("--email=")) args.email = token.slice("--email=".length);
    else if (token.startsWith("--name=")) args.name = token.slice("--name=".length);
  }
  return args;
}

function promptHidden(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY) {
      reject(
        new Error(
          "No interactive terminal available. Set TORRE_ADMIN_PASSWORD instead.",
        ),
      );
      return;
    }
    stdout.write(query);
    stdin.resume();
    stdin.setRawMode(true);
    let input = "";
    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");
      if (char === KEY_ENTER || char === KEY_NEWLINE || char === KEY_EOT) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(input);
      } else if (char === KEY_ETX) {
        stdin.setRawMode(false);
        stdout.write("\n");
        process.exit(1);
      } else if (char === KEY_DEL || char === KEY_BS) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function resolvePassword(): Promise<string> {
  const fromEnv = process.env.TORRE_ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const first = await promptHidden("New admin password: ");
  const second = await promptHidden("Confirm password: ");
  if (first !== second) {
    throw new Error("Passwords do not match.");
  }
  return first;
}

async function main() {
  const { email, name } = parseArgs(process.argv.slice(2));

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Provide a valid email: --email you@example.com");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Configure it before creating an admin.");
    process.exit(1);
  }

  const password = await resolvePassword();
  if (password.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const normalizedEmail = email.trim().toLowerCase();

  const { prisma } = await import("../src/lib/prisma.js");
  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { passwordHash, role: "ADMIN", active: true, name: name ?? undefined },
    create: {
      email: normalizedEmail,
      name: name ?? null,
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  console.log(`Admin ready: ${user.email} (role=${user.role}, id=${user.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("create-admin failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
