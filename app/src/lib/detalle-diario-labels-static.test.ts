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

function extractAgendasBlock(source: string): string {
  const marker = '{title:"Agendas / Leads",bg:"#0f766e",rows:[';
  const start = source.indexOf(marker);
  expect(start, "Detalle Diario Agendas / Leads group missing").toBeGreaterThanOrEqual(0);
  const end = source.indexOf(']},\n    {title:"Costos por Lead"', start);
  expect(end, "Detalle Diario Agendas / Leads group end missing").toBeGreaterThan(start);
  return source.slice(start, end);
}

function extractAgendasRows(source: string): string[] {
  const block = extractAgendasBlock(source);
  return [...block.matchAll(/\{l:"([^"]+)"/g)].map((match) => match[1]);
}

describe("Detalle Diario > Agendas / Leads labels", () => {
  it.each(dashboardFiles)("uses Calificadas wording and requested row order in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    const rows = extractAgendasRows(source);
    expect(rows.join("\n")).not.toMatch(/Cualificad|Cualif\./);
    expect(rows).toEqual([
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

  it.each(dashboardFiles)("does not use collaborator fallback for GHL leads in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    const block = extractAgendasBlock(source);
    expect(block).not.toContain('sdCommercial("agendasHoy")');
    expect(block).not.toContain('sdCommercial("calificadas")');
    expect(block).not.toContain('sdCommercial("showUps")');
    expect(block).not.toContain('cv(d,"agendas_final","agendasHoy")');
    expect(block).not.toContain('cv(d,"agendas_calificadas","calificadas")');
    expect(block).not.toContain('cv(d,"citas_asistidas","showUps")');
  });
});
