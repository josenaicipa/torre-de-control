import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");

describe("onboarding public link routing", () => {
  it("generates the clean /formularioonboarding?token= link", () => {
    const source = readFileSync(
      resolve(
        appRoot,
        "src/app/api/operaciones/students/[id]/onboarding-link/route.ts",
      ),
      "utf8",
    );
    expect(source).toContain(
      "`/formularioonboarding?token=${encodeURIComponent(token)}`",
    );
    expect(source).not.toContain("`/onboarding/${token}`");
  });

  it("keeps the legacy /onboarding/[token] route for already-issued links", () => {
    expect(
      existsSync(resolve(appRoot, "src/app/onboarding/[token]/page.tsx")),
    ).toBe(true);
  });

  it("renders the new route from searchParams.token via the shared view", () => {
    const source = readFileSync(
      resolve(appRoot, "src/app/formularioonboarding/page.tsx"),
      "utf8",
    );
    expect(source).toContain("searchParams");
    expect(source).toContain("OnboardingView");
  });

  it("shares the onboarding view between both routes", () => {
    expect(
      existsSync(resolve(appRoot, "src/app/onboarding/onboarding-view.tsx")),
    ).toBe(true);
    const legacy = readFileSync(
      resolve(appRoot, "src/app/onboarding/[token]/page.tsx"),
      "utf8",
    );
    expect(legacy).toContain("OnboardingView");
  });
});
