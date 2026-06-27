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

  it("shows a friendly missing-token screen, not the invalid-link error", () => {
    const source = readFileSync(
      resolve(appRoot, "src/app/onboarding/onboarding-view.tsx"),
      "utf8",
    );
    // Existe un estado dedicado para "falta token" distinto del error.
    expect(source).toContain("function MissingLink()");
    expect(source).toContain("Este formulario usa un enlace personal");
    // Sin token se renderiza la pantalla amable, no el error rojo.
    expect(source).toContain("if (!token) return <MissingLink />;");
    // El estado de token faltante no usa el texto/estilo de inválido.
    const missingBlock = source.slice(
      source.indexOf("function MissingLink()"),
      source.indexOf("export async function OnboardingView"),
    );
    expect(missingBlock).not.toContain("inválido");
    expect(missingBlock).not.toContain("is-error");
  });
});
