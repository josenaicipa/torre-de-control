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

function extractAgendasRows(source: string): string[] {
  const marker = '{title:"Agendas / Leads",bg:"#0f766e",rows:[';
  const start = source.indexOf(marker);
  expect(start, "Detalle Diario Agendas / Leads group missing").toBeGreaterThanOrEqual(0);
  const end = source.indexOf(']},\n    {title:"Costos por Lead"', start);
  expect(end, "Detalle Diario Agendas / Leads group end missing").toBeGreaterThan(start);
  const block = source.slice(start, end);
  return [...block.matchAll(/\{l:"([^"]+)"/g)].map((match) => match[1]);
}

describe("Detalle Diario > Agendas / Leads labels", () => {
  it.each(dashboardFiles)("uses Calificadas wording and requested row order in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(source).not.toMatch(/Cualificad|Cualif\./);
    expect(extractAgendasRows(source)).toEqual([
      "Agendas Total",
      "Orgánicas",
      "Meta",
      "Google",
      "TikTok",
      "Otros",
      "Hoy (en agenda)",
      "Calificadas Total",
      "% Calificadas",
      "Show Ups",
      "% Show Up Rate",
    ]);
  });
});
