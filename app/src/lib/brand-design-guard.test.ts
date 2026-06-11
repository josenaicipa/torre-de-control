import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Design lock guard: keeps the approved Unlocked Ecom visual system from
// regressing to the legacy look. Contract: docs/design-lock.md
const appRoot = resolve(__dirname, "../..");
const repoRoot = resolve(appRoot, "..");

const PUBLIC_DASHBOARD = resolve(appRoot, "public/index.html");
const PLATAFORMA_DASHBOARD = resolve(appRoot, "public/Plataforma/index.html");
const GLOBALS_CSS = resolve(appRoot, "src/app/globals.css");
const ADMIN_USERS_PAGE = resolve(appRoot, "src/app/admin/users/page.tsx");
const CODEOWNERS = resolve(repoRoot, ".github/CODEOWNERS");
const DESIGN_LOCK = resolve(repoRoot, "docs/design-lock.md");

const read = (path: string) => readFileSync(path, "utf8");

const REQUIRED_BRAND_MARKERS = [
  "UNLOCKED ECOM",
  "mobile-bottom-nav",
  "Hanken Grotesk",
  "#F23005",
];

const LEGACY_MARKERS = [
  "BRAND_GRAD",
  "BRAND_BAR",
  "Space Grotesk",
  "#1e2a4a",
  "#0F172A",
  "Inter:wght@400;500;600;700;800;900",
];

const containsIgnoreCase = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

describe("brand design guard (design lock)", () => {
  it("keeps both static dashboards present and mirrored", () => {
    expect(existsSync(PUBLIC_DASHBOARD)).toBe(true);
    expect(existsSync(PLATAFORMA_DASHBOARD)).toBe(true);
    expect(read(PUBLIC_DASHBOARD)).toBe(read(PLATAFORMA_DASHBOARD));
  });

  it("keeps required Unlocked Ecom markers in both static dashboards", () => {
    for (const path of [PUBLIC_DASHBOARD, PLATAFORMA_DASHBOARD]) {
      const source = read(path);
      for (const marker of REQUIRED_BRAND_MARKERS) {
        expect(source, `${path} must contain "${marker}"`).toContain(marker);
      }
    }
  });

  it("blocks legacy visual markers in both static dashboards", () => {
    for (const path of [PUBLIC_DASHBOARD, PLATAFORMA_DASHBOARD]) {
      const source = read(path);
      for (const marker of LEGACY_MARKERS) {
        expect(
          containsIgnoreCase(source, marker),
          `${path} must NOT contain legacy marker "${marker}"`,
        ).toBe(false);
      }
    }
  });

  it("keeps the approved brand tokens in globals.css", () => {
    const css = read(GLOBALS_CSS);

    expect(css).toContain("--color-accent: #f23005");
    expect(css).toContain("--color-accent-hover: #f8551f");
    expect(css).toContain("--color-accent-press: #d62a04");
    expect(css).toContain("Hanken Grotesk");
    expect(css).toContain(".admin-users-surface");
  });

  it("keeps Admin users on the unified light brand surface", () => {
    const source = read(ADMIN_USERS_PAGE);

    expect(source).toContain("admin-users-surface");
    expect(source).toContain("OperationsShell");
    for (const marker of ["#1e2a4a", "#0F172A", "BRAND_GRAD", "BRAND_BAR", "Space Grotesk"]) {
      expect(
        containsIgnoreCase(source, marker),
        `admin users page must NOT contain legacy marker "${marker}"`,
      ).toBe(false);
    }
  });

  it("keeps the protection files in place (CODEOWNERS + design lock)", () => {
    expect(existsSync(CODEOWNERS)).toBe(true);
    expect(existsSync(DESIGN_LOCK)).toBe(true);

    const codeowners = read(CODEOWNERS);
    expect(codeowners).toContain("@josenaicipa");
    for (const protectedPath of [
      "/app/public/index.html",
      "/app/public/Plataforma/index.html",
      "/app/public/brand/",
      "/app/src/app/globals.css",
      "/app/src/app/admin/users/page.tsx",
      "/docs/design-lock.md",
    ]) {
      expect(codeowners, `CODEOWNERS must protect ${protectedPath}`).toContain(protectedPath);
    }

    const designLock = read(DESIGN_LOCK);
    expect(designLock).toContain("Unlocked Ecom");
    expect(designLock).toContain("Hanken Grotesk");
    expect(designLock).toContain("#F23005");
    expect(designLock).toContain("admin-users-surface");
  });
});
