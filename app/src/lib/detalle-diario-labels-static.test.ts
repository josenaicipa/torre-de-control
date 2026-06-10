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
  const marker = '{title:"Agendas / Leads High Ticket",bg:';
  const start = source.indexOf(marker);
  expect(start, "Detalle Diario Agendas / Leads group missing").toBeGreaterThanOrEqual(0);
  const end = source.indexOf(']},\n    {title:"Costos por Lead"', start);
  expect(end, "Detalle Diario Agendas / Leads group end missing").toBeGreaterThan(start);
  return source.slice(start, end);
}

function extractHighTicketCallsBlock(source: string): string {
  const marker = '{title:"Actividad de llamadas — High Ticket",bg:';
  const start = source.indexOf(marker);
  expect(start, "Detalle Diario Actividad de llamadas — High Ticket group missing").toBeGreaterThanOrEqual(0);
  const end = source.indexOf(']},\n    {title:"Actividad de llamadas — Low Ticket"', start);
  expect(end, "Detalle Diario Actividad de llamadas — High Ticket group end missing").toBeGreaterThan(start);
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

  it.each(dashboardFiles)("sums visible daily cells for Total / Mes except percentage rows in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    const rowTotalBlock = source.slice(source.indexOf('const rowTotalVal=(row)=>{'), source.indexOf('// Monthly aggregates for cost calculations'));

    expect(rowTotalBlock).toContain('if(row.fmt==="%"&&row.totFn) return row.totFn();');
    expect(rowTotalBlock).toContain('if(row.fmt==="%")');
    expect(rowTotalBlock).toContain('const t=dayData.reduce((s,d)=>{const v=row.fn(d);return s+(v||0);},0);');
    expect(rowTotalBlock).not.toContain('if(row.totFn) return row.totFn();');
  });

  it.each(dashboardFiles)("uses manual Closers fields for High Ticket operational rows in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    const block = extractAgendasBlock(source);
    const callsBlock = extractHighTicketCallsBlock(source);
    expect(source).toContain('const highTicketCloserEntries=entries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,d));');
    expect(source).toContain('const sdHighTicketCloser=f=>sumF(highTicketCloserEntries,f);');
    expect(source).toContain('const manualAgendasHoy=d=>d.sdHighTicketCloser("agendasHoy");');
    expect(source).toContain('const manualCalificadas=d=>d.sdHighTicketCloser("calificadas");');
    expect(source).toContain('const manualShowUps=d=>d.sdHighTicketCloser("showUps");');
    expect(block).toContain('{l:"Hoy (en agenda)",fn:d=>manualAgendasHoy(d)||null,fmt:"n"}');
    expect(block).toContain('{l:"Calificadas Total",fn:d=>manualCalificadas(d)||null,fmt:"n"}');
    expect(block).toContain('{l:"% Calificadas",fn:d=>{const h=manualAgendasHoy(d),c=manualCalificadas(d);return h>0?pv(c,h):null;},fmt:"%"');
    expect(block).toContain('{l:"Show Ups",fn:d=>manualShowUps(d)||null,fmt:"n"}');
    expect(block).toContain('{l:"% Show Up Rate",fn:d=>{const c=manualCalificadas(d),s=manualShowUps(d);return c>0?pv(s,c):null;},fmt:"%"');
    expect(block).not.toContain('d.closer.agendas_final||null');
    expect(block).not.toContain('d.closer.agendas_calificadas||null');
    expect(block).not.toContain('d.closer.citas_asistidas||null');
    expect(block).not.toContain('mAgTotal>0?pv(mCalTotal,mAgTotal):null');
    expect(block).not.toContain('mHoyTotal>0?pv(mShows,mHoyTotal):null');
    expect(callsBlock).toContain('{l:"# Agendas hoy",fn:d=>d.sdHighTicketCloser("agendasHoy")||null,fmt:"n"}');
    expect(callsBlock).toContain('{l:"# Show Ups",fn:d=>d.sdHighTicketCloser("showUps")||null,fmt:"n"}');
    expect(callsBlock).toContain('{l:"# Follow Ups contactados",fn:d=>d.sdHighTicketCloser("followUps")||null,fmt:"n"}');
    expect(callsBlock).toContain('{l:"# Leads calientes",fn:d=>d.sdHighTicketCloser("pendAcumulados")||null,fmt:"n"}');
    expect(callsBlock).not.toContain('sdCommercialActivity(');
  });

  it.each(dashboardFiles)("pins May 31 closing adjustment for final May 2026 Torre totals in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(source).toContain('"2026-05-31":{scheduled:1,qualified:10,showed:17,cancelled:0}');
    expect(source).toContain('agendas_calificadas:r.qualified??Math.max(0,(r.scheduled||0)-(r.cancelled||0))');
    expect(source).toContain('agendas_final:r.scheduled||0');
    expect(source).toContain('citas_asistidas:r.showed||0');
  });

  it.each(dashboardFiles)("lists Lucas Soria as a setter collaborator in %s", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(source).toContain('{id:"Lucas Soria",label:"Lucas Soria"');
    expect(source).toContain('role:"setter"');
  });
});
