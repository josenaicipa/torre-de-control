import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");

describe("manual collaborator labels", () => {
  it("shows Valentina Sanchez as the administrative collaborator while keeping the Admin role", () => {
    expect(html).toContain('{id:"Admin",label:"Valentina Sanchez",color:C.red,role:"closer",displayRole:"Admin"}');
    expect(html).not.toContain('{id:"Admin",label:"Admin",color:C.red,role:"closer",displayRole:"Admin"}');
  });

  it("renders the exact Area Comercial form inside Valentina's Por Colaborador view", () => {
    expect(html).toContain('const isValentina=collabId==="Admin";');
    expect(html).toContain('Valentina Sanchez conserva cargo <b style={{color:C.red}}>Admin</b>');
    expect(html).toContain('<CloserEntryForm year={year} month={month} allCloser={allCloser} onSave={onSaveCloser} selectedDate={date}/>');
    expect(html).toContain('<DetalleColaborador allDaily={daily} allCloser={closerData} year={year} month={month} onSave={saveEntry} onSaveCloser={saveCloserEntry}/>');
  });

  it("uses Detalle Diario $ Venta HT as Torre CEO Valor Total Venta comprometido", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    expect(torreBlock).toContain('const totalValor=totalValorHT;');
    expect(torreBlock).not.toContain('const totalValor=totalValorHT+totalValorLT;');
    expect(html).toContain('{l:"$ Venta HT",fn:d=>d.closer.valor_venta_ht||null,fmt:"$"}');
    expect(html).toContain('<Row2 label="Valor Total Venta (comprometido)" value={fD(totalValor)} bold color={BRAND}/>');
  });

  it("replaces the standalone Area Comercial tab with the Por Colaborador tab in second position", () => {
    expect(html).not.toContain('{id:"closer",  l:"Área Comercial",     icon:"dollar"}');
    expect(html).toContain('{id:"colab",   l:"Area Comercial",sub:"Por Colaborador",icon:"dollar"}');
    expect(html).toContain('<span style={{fontSize:9,lineHeight:1.1,opacity:.75}}>{t.sub}</span>');
  });

  it("surfaces legacy Area Comercial daily_closer data under Valentina and uses manual reservas first", () => {
    expect(html).toContain('const closerToValentinaEntry=(date,row)=>({');
    expect(html).toContain('member:"Admin",date,');
    expect(html).toContain('cashReservas:row.cash_reservas||0');
    expect(html).toContain('entriesByCollab.Admin.push(...valentinaCloserEntries);');
    expect(html).toContain('const dispReservas=totalReservasManual||(cashApi?cashApi.reservas:0);');
    expect(html).toContain('{l:"$ Cash Reservas",fn:d=>d.closer.cash_reservas||d.ledger.reservas||null,fmt:"$",totFn:()=>mReservasCash||null}');
    expect(html).toContain('{l:"$ Cash Reservas",k:"cashReservas",fmt:"$"}');
  });

  it("orders Torre CEO execution metrics as sales, show ups, qualified leads, then scheduled calls", () => {
    const realidadBlock = html.slice(
      html.indexOf('<SectionTitle>Realidad del mes (ejecución)</SectionTitle>'),
      html.indexOf('<Row2 label="Ticket promedio (comprometido)"')
    );

    expect(realidadBlock).toMatch(
      /<Row2 label="Ventas reales \(unidades\)"[\s\S]*<Row2 label="Citas Show Up \(asistidas\)"[\s\S]*<Row2 label="Leads calificados reales"[\s\S]*<Row2 label="Citas agendadas reales"/
    );
  });

  it("documents and applies the GHL CAPTACION Y VENTAS rule for May Agendas / Leads", () => {
    expect(html).toContain("const GHL_CAPTACION_MAY_2026_APPOINTMENTS={");
    expect(html).toContain("// Regla aprobada: Calificadas hoy = citas programadas - canceladas");
    expect(html).toContain('"2026-05-20":{scheduled:28,showed:7,cancelled:17}');
    expect(html).toContain("agendas_calificadas:Math.max(0,(r.scheduled||0)-(r.cancelled||0))");
    expect(html).toContain("agendas_final:r.scheduled||0");
    expect(html).toContain("citas_asistidas:r.showed||0");
  });

  it("orders and renames Detalle Diario Agendas / Leads rows around GHL-derived fields", () => {
    const agendasBlock = html.slice(
      html.indexOf('{title:"Agendas / Leads",bg:"#0f766e",rows:['),
      html.indexOf('{title:"Costos por Lead",bg:"#92400e",rows:[')
    );

    expect(agendasBlock).toMatch(
      /l:"Agendas Total"[\s\S]*l:"Agendas Hoy"[\s\S]*l:"Calificadas hoy"[\s\S]*l:"% Calificadas"[\s\S]*l:"Show Ups"[\s\S]*l:"% Show Up Rate"/
    );
    expect(agendasBlock).not.toContain('l:"Hoy (en agenda)"');
    expect(agendasBlock).not.toContain('l:"Cualificadas Total"');
    expect(agendasBlock).not.toContain('l:"% Cualificadas"');
  });

  it("renames Torre CEO Funnel a hoy rows to match Detalle Diario definitions", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const funnelBlock = html.slice(html.indexOf("const funnelRows=["), html.indexOf("const handleSaveCfg=async"));
    expect(funnelBlock).toMatch(
      /l:"Ventas \$ \(comprometido\)"[\s\S]*l:"Ventas \(unidades\)"[\s\S]*l:"Citas Show Up \(asistidas\)"[\s\S]*l:"Leads calificados reales"[\s\S]*l:"Citas agendadas reales"/
    );
    expect(torreBlock).toContain('const totalLeads=closerEntries.reduce((s,e)=>s+Math.min(nv(e.agendas_final),nv(e.agendas_calificadas)),0);');
    expect(torreBlock).toContain('const totalAgendas=closerEntries.reduce((s,e)=>s+Math.max(nv(e.agendas_final),nv(e.agendas_calificadas)),0);');
    expect(funnelBlock).toContain('{l:"Ventas (unidades)",req:funnelVentasUniReq,real:totalVentas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas Show Up (asistidas)",req:funnelAsistidasReq,real:totalAsistidas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Leads calificados reales",req:funnelLeadsReq,real:totalLeads,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas agendadas reales",req:funnelAgendasReq,real:totalAgendas,fmt:"n"}');
    expect(funnelBlock).not.toContain('l:"Citas asistidas"');
    expect(funnelBlock).not.toContain('l:"Citas agend. calificadas"');
    expect(funnelBlock).not.toContain('l:"Leads calificados"');
  });

  it("calculates Salud del embudo ratios from the corrected Torre CEO denominators", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    expect(torreBlock).toContain("const pctLeadsAgReal=totalAgendas>0?pv(totalLeads,totalAgendas):null;");
    expect(torreBlock).toContain("const pctAgAsisReal=totalLeads>0?pv(totalAsistidas,totalLeads):null;");
    expect(torreBlock).toContain("const closeRateReal=totalAsistidas>0?pv(totalVentas,totalAsistidas):null;");
    expect(torreBlock).not.toContain("const pctLeadsAgReal=totalLeads>0?pv(totalAgendas,totalLeads):null;");
    expect(torreBlock).not.toContain("const pctAgAsisReal=totalAgendas>0?pv(totalAsistidas,totalAgendas):null;");
  });
});
