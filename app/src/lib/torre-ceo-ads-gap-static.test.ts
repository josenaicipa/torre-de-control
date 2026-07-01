import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const dashboardFiles = [
  "index.html",
  "Plataforma/index.html",
  "app/public/index.html",
  "app/public/Plataforma/index.html",
];

describe("Torre CEO > Control Ads gap alert", () => {
  it.each(dashboardFiles)(
    "treats under-invested ad spend as a red gap alert in %s",
    (relativePath) => {
      const source = readFileSync(resolve(repoRoot, relativePath), "utf8");

      expect(source).toContain("const gapInversion=invEsperadaHoy-totalGasto;");
      expect(source).toContain("const inversionSubEjecutada=gapInversion>500;");
      expect(source).toContain("const inversionSobreEjecutada=gapInversion<-500;");
      expect(source).toContain(
        'color={inversionSubEjecutada?C.red:inversionSobreEjecutada?C.green:TXT}',
      );
      expect(source).toContain(
        'bg={inversionSubEjecutada?"#fef2f2":inversionSobreEjecutada?"#f0fdf4":"transparent"}',
      );
      expect(source).not.toContain("const gapInversion=totalGasto-invEsperadaHoy;");
    },
  );
});
