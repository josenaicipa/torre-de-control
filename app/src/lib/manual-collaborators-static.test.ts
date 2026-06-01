import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");

describe("manual collaborator labels", () => {
  it("shows Valentina Sanchez as the administrative collaborator while keeping the Admin role", () => {
    expect(html).toContain('{id:"Admin",label:"Valentina Sanchez",color:C.red,role:"closer",displayRole:"Admin"}');
    expect(html).not.toContain('{id:"Admin",label:"Admin",color:C.red,role:"closer",displayRole:"Admin"}');
  });

  it("renders Valentina as an individual commercial collaborator instead of writing the daily total directly", () => {
    expect(html).toContain('const isValentina=collabId==="Admin";');
    expect(html).toContain('Valentina Sanchez conserva cargo <b style={{color:C.red}}>Admin</b>');
    expect(html).toContain('const existing=allDaily[`${date}:${collabId}`]||(collabId==="Admin"&&allCloser[date]?closerToValentinaEntry(date,allCloser[date]):null);');
    expect(html).toContain('{role==="closer"&&(');
    expect(html).toContain('<DetalleColaborador allDaily={daily} allCloser={closerData} year={year} month={month} onSave={saveEntry} onSaveCloser={saveCloserEntry}/>');
    expect(html).not.toContain('<CloserEntryForm year={year} month={month} allCloser={allCloser} onSave={onSaveCloser} selectedDate={date}/>');
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

  it("consolidates all commercial collaborator daily entries into the daily_closer row used by Detalle Diario", () => {
    expect(html).toContain('const commercialEntriesForDate=(allDaily,date,overrideKey,overrideEntry)=>{');
    expect(html).toContain('const aggregateCommercialEntriesForCloser=(date,entries,existingCloser={})=>{');
    expect(html).toContain('q_ventas_ht:s("ventasHT"),valor_venta_ht:s("valorVentaHT"),');
    expect(html).toContain('ventas_cash:s("upfrontCash"),upfront_cash_ht:s("upfrontCash"),recurring_cash:s("recurringCash"),');
    expect(html).toContain('q_reservas:s("reservas"),cash_reservas:s("cashReservas"),');
    expect(html).toContain('const commercialRows=commercialEntriesForDate(nd,entry.date,key,entry);');
    expect(html).toContain('const closerRow=aggregateCommercialEntriesForCloser(entry.date,commercialRows,closerData[entry.date]||{});');
    expect(html).toContain('await saveCloserEntry(entry.date,closerRow);');
  });

  it("integrates the useful numeric operator daily report fields into Area Comercial por colaborador", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const tablaBlock = html.slice(html.indexOf('const TablaMensual='), html.indexOf('const DetallePorDia='));

    expect(html).toContain('callsScheduled:0,hotLeads:0,');
    expect(html).toContain('callsScheduled:row.ig_followers||0,');
    expect(html).toContain('hotLeads:row.bk_offers||0,');
    expect(llenarBlock).toContain('<STit icon="📞" title="Actividad de llamadas" sub="Campos traídos del reporte manual diario"/>');
    expect(llenarBlock).toContain('<Inp label="# Llamadas / citas que tenías" value={form.callsScheduled} onChange={v=>sf("callsScheduled",v)}/>');
    expect(llenarBlock).toContain('<Inp label="# Leads calientes" value={form.hotLeads} onChange={v=>sf("hotLeads",v)}/>');
    expect(llenarBlock).toContain('<Inp label="# Cierres" value={form.ventasHT} onChange={v=>sf("ventasHT",v)}/>');
    expect(tablaBlock).toContain('{l:"# Llamadas / citas que tenías",k:"callsScheduled",fmt:"n"}');
    expect(tablaBlock).toContain('{l:"# Leads calientes",k:"hotLeads",fmt:"n"}');
    expect(html).toContain('{title:"Actividad de llamadas — Área Comercial",bg:"#0369a1",rows:[');
    expect(html).toContain('{l:"# Llamadas / citas que tenías",fn:d=>d.sdCommercial("callsScheduled")||null,fmt:"n"}');
    expect(html).toContain('{l:"# Leads calientes",fn:d=>d.sdCommercial("hotLeads")||null,fmt:"n"}');
  });

  it("splits Area Comercial report entry into Admin, Setters, Closers, and Marketing sub-tabs", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));

    expect(html).toContain('const SETTER_COLLABORATORS=[');
    expect(html).toContain('{id:"Alejandro Gallo",label:"Alejandro Gallo",color:C.teal,role:"setter"}');
    expect(html).toContain('{id:"Daniel Garcia",label:"Daniel Garcia",color:C.blue,role:"setter"}');
    expect(html).toContain('{id:"Karen Setter",label:"Karen Anquiz",color:C.purple,role:"setter",displayRole:"Setter"}');
    expect(html).toContain('const REPORT_GROUPS={');
    expect(html).toContain('admin:{label:"Admin",collaborators:ADMIN_COLLABORATORS}');
    expect(html).toContain('setters:{label:"Setters",collaborators:SETTER_COLLABORATORS}');
    expect(html).toContain('closers:{label:"Closers",collaborators:CLOSER_COLLABORATORS}');
    expect(html).toContain('marketing:{label:"Marketing",collaborators:MARKETING_COLLABORATORS}');
    expect(llenarBlock).toContain('{Object.entries(REPORT_GROUPS).map(([key,g])=>(');
  });

  it("replicates the metrics setter form and adds closer notes fields in Area Comercial", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));

    expect(html).toContain('setterLeadsContacted:0,setterConfirmedAgendas:0,setterCallsToLeads:0,setterMessagesSent:0,');
    expect(html).toContain('setterOrganicLeads:0,setterAdsLeads:0,');
    expect(html).toContain('showupNotes:"",hotLeadsEvidence:"",blockers:"",setterFindings:"",');
    expect(llenarBlock).toContain('<STit icon="💬" title="Reporte de Setter" sub="Qué pasó con tus conversaciones"/>');
    expect(llenarBlock).toContain('<Inp label="Leads contactados" value={form.setterLeadsContacted} onChange={v=>sf("setterLeadsContacted",v)}/>');
    expect(llenarBlock).toContain('<Inp label="Agendas confirmadas" value={form.setterConfirmedAgendas} onChange={v=>sf("setterConfirmedAgendas",v)}/>');
    expect(llenarBlock).toContain('<Inp label="Llamadas a leads" value={form.setterCallsToLeads} onChange={v=>sf("setterCallsToLeads",v)}/>');
    expect(llenarBlock).toContain('<Inp label="Mensajes enviados" value={form.setterMessagesSent} onChange={v=>sf("setterMessagesSent",v)}/>');
    expect(llenarBlock).toContain('<Inp label="Orgánicos" value={form.setterOrganicLeads} onChange={v=>sf("setterOrganicLeads",v)}/>');
    expect(llenarBlock).toContain('<Inp label="Ads" value={form.setterAdsLeads} onChange={v=>sf("setterAdsLeads",v)}/>');
    expect(llenarBlock).toContain('<Txt label="Hallazgos importantes" value={form.setterFindings} onChange={v=>st("setterFindings",v)} placeholder="Ej: iniciales + hallazgo: presupuesto, objeción, urgencia, mala calidad, etc."/>');
    expect(llenarBlock).toContain('{isValentina?(');
    expect(llenarBlock).toContain('<STit icon="📝" title="Notas generales" sub="Contexto cualitativo administrativo"/>');
    expect(llenarBlock).toContain('<Txt label="Notas generales" value={form.showupNotes} onChange={v=>st("showupNotes",v)} placeholder="Ej: contexto general del día, seguimiento administrativo, pendientes o alertas..."/>');
    expect(llenarBlock).toContain('<STit icon="📝" title="Notas del closer" sub="Contexto cualitativo del reporte manual"/>');
    expect(llenarBlock).toContain('<Txt label="Notas/acciones importantes de los showups" value={form.showupNotes} onChange={v=>st("showupNotes",v)} placeholder="Ej: AM mostró intención alta, revisar grabación Fathom y enviar plan de pago..."/>');
    expect(llenarBlock).toContain('<Txt label="Evidencia manual de leads calientes" value={form.hotLeadsEvidence} onChange={v=>st("hotLeadsEvidence",v)} placeholder="Ej: Iniciales + razón: showup + Fathom HOT/WARM, pipeline seguimiento, reserva pendiente..."/>');
    expect(llenarBlock).toContain('<Txt label="Bloqueos o contexto que Jose debe saber" value={form.blockers} onChange={v=>st("blockers",v)}/>');
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
    expect(html).toContain("// Regla aprobada: Calificadas = citas programadas - canceladas");
    expect(html).toContain('"2026-05-20":{scheduled:24,showed:5,cancelled:15}');
    expect(html).toContain('"2026-05-30":{scheduled:16,showed:2,cancelled:12}');
    expect(html).toContain('"2026-05-31":{scheduled:0,showed:0,cancelled:0}');
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
      /l:"Agendas Total"[\s\S]*l:"Orgánicas"[\s\S]*l:"Meta"[\s\S]*l:"Google"[\s\S]*l:"TikTok"[\s\S]*l:"Otros"[\s\S]*l:"Hoy \(en agenda\)"[\s\S]*l:"Calificadas Total"[\s\S]*l:"% Calificadas"[\s\S]*l:"Show Ups"[\s\S]*l:"% Show Up Rate"/
    );
    expect(agendasBlock).not.toContain('l:"Agendas Hoy"');
    expect(agendasBlock).not.toContain('l:"Cualificadas Total"');
    expect(agendasBlock).not.toContain('l:"Cualificadas');
    expect(agendasBlock).not.toContain('l:"Calificadas hoy"');
  });

  it("uses Calificadas wording and requested section order in the Agendas / Leads operational screen", () => {
    const agendasScreen = html.slice(
      html.indexOf('const AgendasLeadsForm='),
      html.indexOf('// ─── DETALLE DIARIO')
    );

    expect(agendasScreen).toMatch(/<CanalGrid prefix="agendas" label="Agendas"\/>[\s\S]*<CanalGrid prefix="hoy" label="Agendas Hoy"\/>[\s\S]*<CanalGrid prefix="cal" label="Calificadas"\/>[\s\S]*<CanalGrid prefix="show" label="Show Ups"\/>/);
    expect(agendasScreen).toContain('<Stat label="Calificadas" value={fN(totalCal)} color={C.purple}/>');
    expect(agendasScreen).toContain('<Stat label="% Calificadas" value={fP(calRate)} color={cH(calRate,50,30)}/>');
    expect(agendasScreen).toContain('<CanalGrid prefix="cal" label="Calificadas"/>');
    expect(agendasScreen).not.toContain('Cualificadas');
  });

  it("uses the fixed 0.00476 leads-per-dollar assumption for Modelo objetivo del embudo", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));

    expect(html).toContain("const LEADS_NECESARIOS_POR_DOLAR=0.00476;");
    expect(html).toContain("const leadsPerDollarForRevenue=()=>LEADS_NECESARIOS_POR_DOLAR;");
    expect(torreBlock).toContain("const leadsMeta=metaMensual>0?metaMensual*leadsPorDolar:0;");
    expect(torreBlock).toContain("const agendaMeta=pctLeadsAg>0?leadsMeta*(pctLeadsAg/100):0;");
    expect(torreBlock).toContain("const asistidaMeta=pctAgAsis>0?agendaMeta*(pctAgAsis/100):0;");
    expect(torreBlock).toContain("const ventasUniMeta=closeRateMeta>0?asistidaMeta*(closeRateMeta/100):0;");
  });

  it("calculates Torre CEO Funnel a hoy required values from current committed ticket and target conversion rates", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const funnelBlock = html.slice(html.indexOf("const funnelRows=["), html.indexOf("const handleSaveCfg=async"));

    expect(torreBlock).toContain("const ventasReqHoy=ticketProm>0?metaMensual/ticketProm:0;");
    expect(torreBlock).toContain("const asistidasReqHoy=closeRateMeta>0?ventasReqHoy/(closeRateMeta/100):0;");
    expect(torreBlock).toContain("const citasAgendadasReqHoy=pctAgAsis>0?asistidasReqHoy/(pctAgAsis/100):0;");
    expect(torreBlock).toContain("const leadsReqHoy=pctLeadsAg>0?citasAgendadasReqHoy/(pctLeadsAg/100):0;");
    expect(torreBlock).toContain("const citasAgendadasDisplayReqHoy=Math.max(citasAgendadasReqHoy,leadsReqHoy);");
    expect(torreBlock).toContain("const leadsCalificadosDisplayReqHoy=Math.min(citasAgendadasReqHoy,leadsReqHoy);");
    expect(torreBlock).not.toContain("const leadsReqHoy=pctAgAsis>0?asistidasReqHoy/(pctAgAsis/100):0;");
    expect(torreBlock).not.toContain("const agendasReqHoy=pctLeadsAg>0?leadsReqHoy/(pctLeadsAg/100):0;");
    expect(funnelBlock).toMatch(
      /l:"Ventas \$ \(comprometido\)"[\s\S]*l:"Ventas \(unidades\)"[\s\S]*l:"Citas Show Up \(asistidas\)"[\s\S]*l:"Leads calificados reales"[\s\S]*l:"Citas agendadas reales"/
    );
    expect(funnelBlock).toContain('{l:"Ventas $ (comprometido)",req:metaMensual,real:totalValor,fmt:"$"}');
    expect(funnelBlock).toContain('{l:"Ventas (unidades)",req:ventasReqHoy,real:totalVentas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas Show Up (asistidas)",req:asistidasReqHoy,real:totalAsistidas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Leads calificados reales",req:leadsCalificadosDisplayReqHoy,real:totalLeads,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas agendadas reales",req:citasAgendadasDisplayReqHoy,real:totalAgendas,fmt:"n"}');
    expect(funnelBlock).not.toContain('l:"Citas asistidas"');
    expect(funnelBlock).not.toContain('l:"Citas agend. calificadas"');
    expect(funnelBlock).not.toContain('l:"Leads calificados"');
  });

  it("documents the data flow: operational screens and GHL feed daily_closer before Torre CEO totals", () => {
    const loadBlock = html.slice(html.indexOf('const [{data:kpiRows'), html.indexOf('const kk=`kpi:${year}-${month}`'));
    const saveCloserBlock = html.slice(html.indexOf('const saveCloserEntry=async'), html.indexOf('const saveKpiConfig=async'));
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));

    expect(html).toContain("// GHL → daily_closer / Detalle Diario → Torre CEO.");
    expect(html).toContain("Agendas / Leads and Área Comercial are operational entry screens");
    expect(loadBlock).toContain('db.from("daily_closer").select("*")');
    expect(loadBlock).toContain('setCloserData(applyGhlCaptacionAgendasLeads(closerObj));');
    expect(saveCloserBlock).toContain('await db.from("daily_closer").upsert({');
    expect(saveCloserBlock).toContain('{onConflict:"date"}');
    expect(torreBlock).toContain('const closerEntries=Object.entries(allCloser).filter(([k])=>k.startsWith(prefix)).map(([,v])=>v);');
    expect(torreBlock).toContain('const totalValor=totalValorHT;');
    expect(torreBlock).toContain('const totalVentas=sumF(closerEntries,"q_ventas_ht");');
    expect(torreBlock).toContain('const totalAgendasCampo=sumF(closerEntries,"agendas_final");');
    expect(torreBlock).toContain('const totalLeadsCampo=sumF(closerEntries,"agendas_calificadas");');
    expect(torreBlock).toContain('const totalAgendas=Math.max(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).toContain('const totalLeads=Math.min(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).toContain('const totalAsistidas=sumF(closerEntries,"citas_asistidas");');
  });

  it("calculates Salud del embudo ratios from the corrected Torre CEO denominators", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    expect(torreBlock).toContain("const pctLeadsAgReal=totalAgendas>0?pv(totalLeads,totalAgendas):null;");
    expect(torreBlock).toContain("const pctAgAsisReal=totalAgendas>0?pv(totalAsistidas,totalAgendas):null;");
    expect(torreBlock).toContain("const closeRateReal=totalAsistidas>0?pv(totalVentas,totalAsistidas):null;");
    expect(torreBlock).not.toContain("const pctLeadsAgReal=totalLeads>0?pv(totalAgendas,totalLeads):null;");
    expect(torreBlock).not.toContain("const pctAgAsisReal=totalLeads>0?pv(totalAsistidas,totalLeads):null;");
    expect(html).toContain('l:"% Agendadas → Leads calificados",meta:pctLeadsAg,real:pctLeadsAgReal');
  });
});
