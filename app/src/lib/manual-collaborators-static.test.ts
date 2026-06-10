import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "public", "index.html"), "utf8");

describe("manual collaborator labels", () => {
  it("shows Valentina Sanchez as the administrative collaborator while keeping the Admin role", () => {
    expect(html).toContain('{id:"Admin",label:"Valentina Sanchez",color:C.red,role:"closer",displayRole:"Admin"}');
    expect(html).not.toContain('{id:"Admin",label:"Admin",color:C.red,role:"closer",displayRole:"Admin"}');
  });

  it("renders Valentina as an individual commercial collaborator with her legacy Area Comercial fields plus notes", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const valentinaBlock = llenarBlock.slice(llenarBlock.indexOf('{isValentina&&('), llenarBlock.indexOf('{!isValentina&&role==="closer"&&('));

    expect(html).toContain('const isValentina=collabId==="Admin";');
    expect(html).toContain('Valentina Sanchez conserva cargo <b style={{color:C.red}}>Admin</b>');
    expect(html).toContain('const existing=allDaily[`${date}:${collabId}`]||(collabId==="Admin"&&allCloser[date]?closerToValentinaEntry(date,allCloser[date]):null);');
    expect(html).toContain('<DetalleColaborador allDaily={daily} allCloser={closerData} year={year} month={month} onSave={saveEntry} onSaveCloser={saveCloserEntry}/>');
    expect(html).not.toContain('<CloserEntryForm year={year} month={month} allCloser={allCloser} onSave={onSaveCloser} selectedDate={date}/>');

    expect(valentinaBlock).toContain('<STit icon="💰" title="High Ticket"/>');
    expect(valentinaBlock).toContain('<Inp label="# Ventas HT" value={form.ventasHT} onChange={v=>sf("ventasHT",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="$ Venta HT" prefix="$" value={form.valorVentaHT} onChange={v=>sf("valorVentaHT",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="Upfront Cash HT" prefix="$" value={form.upfrontCash} onChange={v=>sf("upfrontCash",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="Cash Collected HT" prefix="$" value={form.cashCollected} onChange={v=>sf("cashCollected",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="Recurring Cash" prefix="$" value={form.recurringCash} onChange={v=>sf("recurringCash",v)}/>');
    expect(valentinaBlock).toContain('<STit icon="🎯" title="Low Ticket"/>');
    expect(valentinaBlock).toContain('<Inp label="# Ventas LT" value={form.ventasLT} onChange={v=>sf("ventasLT",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="$ Venta LT" prefix="$" value={form.valorVentaLT} onChange={v=>sf("valorVentaLT",v)}/>');
    expect(valentinaBlock).toContain('<STit icon="🔖" title="Reservas"/>');
    expect(valentinaBlock).toContain('<Inp label="# Reservas" value={form.reservas} onChange={v=>sf("reservas",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="$ Cash Collected Reservas" prefix="$" value={form.cashReservas} onChange={v=>sf("cashReservas",v)}/>');
    expect(valentinaBlock).toContain('<STit icon="↩️" title="Reembolsos"/>');
    expect(valentinaBlock).toContain('<Inp label="# Reembolsos" value={form.refunds} onChange={v=>sf("refunds",v)}/>');
    expect(valentinaBlock).toContain('<Inp label="$ Valor Reembolsos" prefix="$" value={form.refundValue} onChange={v=>sf("refundValue",v)}/>');
    expect(valentinaBlock).toContain('<STit icon="👥" title="Clientes"/>');
    expect(valentinaBlock).toContain('<Inp label="# Total de Clientes Activos" value={form.activeClients} onChange={v=>sf("activeClients",v)}/>');
    expect(valentinaBlock).toContain('<Txt label="Notas generales" value={form.showupNotes} onChange={v=>st("showupNotes",v)} placeholder="Ej: contexto general del día, seguimiento administrativo, pendientes o alertas..."/>');
  });

  it("uses Detalle Diario $ Venta HT as Torre CEO Valor Total Venta comprometido", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    expect(torreBlock).toContain('const totalValor=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).valorHT,0);');
    expect(torreBlock).not.toContain('const totalValor=totalValorHT+totalValorLT;');
    expect(html).toContain('{l:"$ Venta HT",fn:d=>valorHTDay(d)||null,fmt:"$"}');
    expect(html).toContain('<Row2 label="Valor Total Venta (comprometido)" value={fD(totalValor)} bold color={BRAND}/>');
  });

  it("uses Valor Total Venta comprometido plus Cash Low Ticket as Ritmo del mes real sales value for every month", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const ritmoBlock = html.slice(html.indexOf('{/* RITMO + PROYECCIÓN */}'), html.indexOf('{/* FUNNEL A HOY */}'));

    expect(torreBlock).toContain('const ventasRealesAcum=totalValor+dispLowT;');
    expect(torreBlock).toContain('const pctCumpl=pv(ventasRealesAcum,metaMensual);');
    expect(torreBlock).not.toContain('const ventasRealesAcum=totalValor;');
    expect(torreBlock).not.toContain('const ventasRealesAcum=isPast?dispCash:totalValor+dispLowT;');
    expect(torreBlock).not.toContain('const pctCumpl=pv(dispCash,metaMensual);');
    expect(ritmoBlock).toContain('<Row2 label={isPast?"Ventas reales al cierre ($)":"Ventas reales acumuladas ($)"} value={fD(ventasRealesAcum)}');
    expect(ritmoBlock).toContain('<Row2 label="Ventas reales al cierre ($)" value={fD(ventasRealesAcum)}');
    expect(ritmoBlock).toContain('<Row2 label="Gap real vs meta ($)" value={fD(ventasRealesAcum-metaMensual)}');
    expect(ritmoBlock).not.toContain('<Row2 label="Ventas reales al cierre ($)" value={fD(dispCash)}');
    expect(ritmoBlock).not.toContain('<Row2 label="Gap real vs meta ($)" value={fD(dispCash-metaMensual)}');
  });

  it("replaces the standalone Area Comercial tab with the Por Colaborador tab in second position", () => {
    expect(html).not.toContain('{id:"closer",  l:"Área Comercial",     icon:"dollar"}');
    expect(html).toContain('{id:"colab",   l:"Area Comercial",sub:"Por Colaborador",icon:"dollar"}');
    expect(html).toContain('<span style={{fontSize:9,lineHeight:1.1,opacity:.75}}>{t.sub}</span>');
  });


  it("surfaces legacy Area Comercial daily_closer data under Valentina and uses manual reservas first", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('// Admin/closer legacy daily_closer values'));

    expect(html).toContain('const closerToValentinaEntry=(date,row)=>({');
    expect(html).toContain('member:"Admin",date,');
    expect(html).toContain('cashReservas:row.cash_reservas||0');
    expect(html).toContain('entriesByCollab.Admin.push(...valentinaCloserEntries);');
    expect(html).toContain('const dispReservas=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).reservas,0)||(cashApi?cashApi.reservas:0);');
    expect(llenarBlock).toContain('<Inp label="# Reservas" value={form.reservas} onChange={v=>sf("reservas",v)}/>');
    expect(llenarBlock).toContain('<Inp label="$ Reservas" prefix="$" value={form.cashReservas} onChange={v=>sf("cashReservas",v)}/>');
    expect(llenarBlock).toMatch(/<Inp label="# Reservas" value=\{form\.reservas\}[\s\S]*<Inp label="\$ Reservas" prefix="\$" value=\{form\.cashReservas\}/);
    expect(detalleBlock).toContain('{l:"# Reservas",fn:d=>cv(d,"q_reservas","reservas")||null,fmt:"n"}');
    expect(detalleBlock).toContain('{l:"$ Cash Reservas",fn:d=>cashReservasDay(d)||null,fmt:"$"}');
    expect(html).toContain('{l:"$ Cash Reservas",k:"cashReservas",fmt:"$"}');
  });

  it("keeps commercial collaborator daily entries in daily_entries instead of rewriting manual Agendas / Leads", () => {
    const saveEntryBlock = html.slice(html.indexOf('const saveEntry=async'), html.indexOf('const saveCloserEntry=async'));

    expect(html).not.toContain('const commercialEntriesForDate=(allDaily,date,overrideKey,overrideEntry)=>{');
    expect(html).not.toContain('const aggregateCommercialEntriesForCloser=(date,entries,existingCloser={})=>{');
    expect(saveEntryBlock).toContain('await db.from("daily_entries").upsert({');
    expect(saveEntryBlock).not.toContain('const commercialRows=commercialEntriesForDate(nd,entry.date,key,entry);');
    expect(saveEntryBlock).not.toContain('const closerRow=aggregateCommercialEntriesForCloser(entry.date,commercialRows,closerData[entry.date]||{});');
    expect(saveEntryBlock).not.toContain('await saveCloserEntry(entry.date,closerRow);');
  });

  it("shows Area Comercial por colaborador entries in Detalle Diario and Torre for June onward without rewriting closed May", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));

    expect(html).toContain('gasto_otros:isCommercialMember(entry.member)?(entry.cashReservas||0):(entry.gastoOtros||0),');
    expect(html).toContain('cashReservas:isCommercialMember(row.member)?(row.gasto_otros||0):0,');
    expect(torreBlock).toContain('const allowCommercialFallback=year>2026||(year===2026&&month>=5);');
    expect(torreBlock).toContain('const collabCommercialEntries=allowCommercialFallback?dailyEntries.filter(e=>e&&isCommercialReportingMember(e.member,e.date)):[];');
    expect(torreBlock).toContain('const highTicketCloserMonthlyEntries=allowCommercialFallback?dailyEntries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,e.date)):[];');
    expect(torreBlock).toContain('const totalLeadsFromDetalle=sumF(highTicketCloserMonthlyEntries,"calificadas");');
    expect(torreBlock).toContain('const totalLeads=totalLeadsFromDetalle||sumF(closerEntries,"agendas_calificadas");');
    expect(torreBlock).not.toContain('const totalLeads=Math.min(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).not.toContain('const totalLeadsFromCollaborators=sumF(collabCommercialEntries,"calificadas");');
    expect(torreBlock).toContain('const commercialEntriesByDay={};');
    expect(torreBlock).toContain('addByDay(commercialValorHTByDay,date,commercialValueByDay(date,"valorVentaHT"));');
    expect(torreBlock).toContain('const monthlyCommercialSalesDay=(date,closerRow)=>commercialDayHasPrimary(date,commercialEntriesByDay[date]||[])?commercialValueByDay(date,"ventasHT"):(commercialValueByDay(date,"ventasHT")||((closerRow&&closerRow.q_ventas_ht)||0));');
    expect(detalleBlock).toContain('const allowCommercialFallback=d>="2026-06-01";');
    expect(detalleBlock).toContain('const sdCommercial=f=>allowCommercialFallback?commercialDayValue(d,commercialEntries,f):0;');
    expect(detalleBlock).toContain('const cv=(d,closerField,entryField)=>d.hasPrimaryCommercial?d.sdCommercial(entryField):areaComercialHasPriority(d.d)?d.sdCommercial(entryField)||d.closer[closerField]||0:d.closer[closerField]||d.sdCommercial(entryField)||0;');
    expect(detalleBlock).toContain('const mVentasHT=dayData.reduce((s,d)=>s+cv(d,"q_ventas_ht","ventasHT"),0);');
    expect(detalleBlock).toContain('const mValorHT=dayData.reduce((s,d)=>s+valorHTDay(d),0);');
    expect(detalleBlock).toContain('{l:"# Ventas HT",fn:d=>cv(d,"q_ventas_ht","ventasHT")||null,fmt:"n"}');
    expect(detalleBlock).toContain('{l:"$ Venta HT",fn:d=>valorHTDay(d)||null,fmt:"$"}');
    expect(detalleBlock).toContain('{l:"Recurring Cash",fn:d=>recurringDay(d)||null,fmt:"$"}');
    expect(detalleBlock).toContain('{l:"# Reservas",fn:d=>cv(d,"q_reservas","reservas")||null,fmt:"n"}');
    expect(detalleBlock).toContain('{l:"$ Cash Reservas",fn:d=>cashReservasDay(d)||null,fmt:"$"}');
  });

  it("maps Torre CEO real funnel metrics exactly from Detalle Diario High Ticket totals", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));

    expect(detalleBlock).toContain('const manualAgendasHoy=d=>d.sdHighTicketCloser("agendasHoy");');
    expect(detalleBlock).toContain('const manualCalificadas=d=>d.sdHighTicketCloser("calificadas");');
    expect(detalleBlock).toContain('const manualShowUps=d=>d.sdHighTicketCloser("showUps");');
    expect(detalleBlock).toContain('{l:"Hoy (en agenda)",fn:d=>manualAgendasHoy(d)||null,fmt:"n"}');
    expect(detalleBlock).toContain('{l:"Calificadas Total",fn:d=>manualCalificadas(d)||null,fmt:"n"}');
    expect(detalleBlock).toContain('{l:"Show Ups",fn:d=>manualShowUps(d)||null,fmt:"n"}');

    expect(torreBlock).toContain('const highTicketCloserMonthlyEntries=allowCommercialFallback?dailyEntries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,e.date)):[];');
    expect(torreBlock).toContain('const totalAgendasFromDetalle=sumF(highTicketCloserMonthlyEntries,"agendasHoy");');
    expect(torreBlock).toContain('const totalLeadsFromDetalle=sumF(highTicketCloserMonthlyEntries,"calificadas");');
    expect(torreBlock).toContain('const totalShowsFromDetalle=sumF(highTicketCloserMonthlyEntries,"showUps");');
    expect(torreBlock).toContain('const totalAgendas=totalAgendasFromDetalle||sumF(closerEntries,"agendas_final");');
    expect(torreBlock).toContain('const totalLeads=totalLeadsFromDetalle||sumF(closerEntries,"agendas_calificadas");');
    expect(torreBlock).toContain('const totalAsistidas=totalShowsFromDetalle||sumF(closerEntries,"citas_asistidas");');
    expect(torreBlock).not.toContain('const totalAgendas=Math.max(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).not.toContain('const totalLeads=Math.min(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).not.toContain('const totalLeadsFromCollaborators=sumF(collabCommercialEntries,"calificadas");');
  });

  it("gives Admin Area Comercial entries authoritative priority from 2026-06-08 onward", () => {
    expect(html).toContain('const AREA_COMERCIAL_PRIORITY_START="2026-06-08";');
    expect(html).toContain('const areaComercialHasPriority=date=>date>=AREA_COMERCIAL_PRIORITY_START;');
    expect(html).toContain('const commercialPrimaryEntry=entries=>(entries||[]).find(e=>e&&isAdminMember(e.member))||null;');
    expect(html).toContain('const commercialDayHasPrimary=(date,entries)=>areaComercialHasPriority(date)&&!!commercialPrimaryEntry(entries);');
    expect(html).toContain('const commercialDayValue=(date,entries,field)=>commercialDayHasPrimary(date,entries)?nv(commercialPrimaryEntry(entries)[field]):sumF(entries,field);');
    expect(html).toContain('const totalVentas=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialSalesDay(date,allCloser[date]),0);');
    expect(html).toContain('const hasPrimaryCommercial=commercialDayHasPrimary(d,commercialEntries);');
    expect(html).toContain('const sdCommercial=f=>allowCommercialFallback?commercialDayValue(d,commercialEntries,f):0;');
    expect(html).toContain('const cv=(d,closerField,entryField)=>d.hasPrimaryCommercial?d.sdCommercial(entryField):areaComercialHasPriority(d.d)?d.sdCommercial(entryField)||d.closer[closerField]||0:d.closer[closerField]||d.sdCommercial(entryField)||0;');
    expect(html).toContain('const valorHTDay=d=>d.hasPrimaryCommercial?d.sdCommercial("valorVentaHT"):areaComercialHasPriority(d.d)?d.sdCommercial("valorVentaHT")||d.closer.valor_venta_ht||0:d.closer.valor_venta_ht||d.sdCommercial("valorVentaHT")||0;');
    expect(html).not.toContain('const totalVentasFromCollaborators=sumF(collabCommercialEntries,"ventasHT");');
    expect(html).not.toContain('const totalVentas=totalVentasFromCollaborators||sumF(closerEntries,"q_ventas_ht");');
  });

  it("sums commercial money metrics day-by-day in Detalle Diario and Torre CEO instead of choosing one monthly source", () => {
    expect(html).toContain('const monthlyCommercialMoneyDates=[...new Set([');
    expect(html).toContain('...Object.keys(commercialValorHTByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('...Object.keys(commercialRecurringByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('...Object.keys(commercialLowTicketByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('...Object.keys(commercialReservasByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('...Object.keys(ledgerLTByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('...Object.keys(ledgerReservasByDay).filter(k=>k.startsWith(prefix)),');
    expect(html).toContain('const monthlyCommercialMoneyDay=(date,closerRow)=>{');
    expect(html).toContain('valorHT:hasPrimary?commercialValueByDay(date,"valorVentaHT"):areaComercialHasPriority(date)?commercialValorHTByDay[date]||((closerRow&&closerRow.valor_venta_ht)||0):((closerRow&&closerRow.valor_venta_ht)||commercialValorHTByDay[date]||0),');
    expect(html).toContain('cashHT:hasPrimary?(commercialValueByDay(date,"cashCollected")||commercialValueByDay(date,"upfrontCash")):areaComercialHasPriority(date)?commercialCashByDay[date]||((closerRow&&closerRow.ventas_cash)||ledgerHTByDay[date]||0):((closerRow&&closerRow.ventas_cash)||commercialCashByDay[date]||ledgerHTByDay[date]||0),');
    expect(html).toContain('recurring:hasPrimary?commercialValueByDay(date,"recurringCash"):areaComercialHasPriority(date)?commercialRecurringByDay[date]||((closerRow&&closerRow.recurring_cash)||0):((closerRow&&closerRow.recurring_cash)||commercialRecurringByDay[date]||0),');
    expect(html).toContain('lowTicket:hasPrimary?commercialValueByDay(date,"valorVentaLT"):areaComercialHasPriority(date)?commercialLowTicketByDay[date]||((closerRow&&closerRow.valor_venta_lt)||ledgerLTByDay[date]||0):((closerRow&&closerRow.valor_venta_lt)||commercialLowTicketByDay[date]||ledgerLTByDay[date]||0),');
    expect(html).toContain('reservas:hasPrimary?commercialValueByDay(date,"cashReservas"):areaComercialHasPriority(date)?commercialReservasByDay[date]||((closerRow&&closerRow.cash_reservas)||ledgerReservasByDay[date]||0):((closerRow&&closerRow.cash_reservas)||commercialReservasByDay[date]||ledgerReservasByDay[date]||0),');
    expect(html).toContain('const totalValor=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).valorHT,0);');
    expect(html).toContain('const dispCash=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).cashHT,0)||(cashApi?cashApi.highTicket:0);');
    expect(html).toContain('const totalRecurring=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).recurring,0);');
    expect(html).toContain('const dispLowT=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).lowTicket,0)||(cashApi?cashApi.lowTicket:0);');
    expect(html).toContain('const dispReservas=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).reservas,0)||(cashApi?cashApi.reservas:0);');
    expect(html).toContain('const valorHTDay=d=>d.hasPrimaryCommercial?d.sdCommercial("valorVentaHT"):areaComercialHasPriority(d.d)?d.sdCommercial("valorVentaHT")||d.closer.valor_venta_ht||0:d.closer.valor_venta_ht||d.sdCommercial("valorVentaHT")||0;');
    expect(html).toContain('const cashHTDay=d=>d.hasPrimaryCommercial?(d.sdCommercial("cashCollected")||d.sdCommercial("upfrontCash")):areaComercialHasPriority(d.d)?d.sdCommercial("cashCollected")||d.sdCommercial("upfrontCash")||d.closer.ventas_cash||d.ledger.highTicket||0:d.closer.ventas_cash||d.sdCommercial("cashCollected")||d.sdCommercial("upfrontCash")||d.ledger.highTicket||0;');
    expect(html).toContain('const recurringDay=d=>d.hasPrimaryCommercial?d.sdCommercial("recurringCash"):areaComercialHasPriority(d.d)?d.sdCommercial("recurringCash")||d.closer.recurring_cash||0:d.closer.recurring_cash||d.sdCommercial("recurringCash")||0;');
    expect(html).toContain('const cashLowTicketDay=d=>d.hasPrimaryCommercial?d.sdCommercial("valorVentaLT"):areaComercialHasPriority(d.d)?d.sdCommercial("valorVentaLT")||d.closer.valor_venta_lt||d.ledger.lowTicket||0:d.closer.valor_venta_lt||d.sdCommercial("valorVentaLT")||d.ledger.lowTicket||0;');
    expect(html).toContain('const cashReservasDay=d=>d.hasPrimaryCommercial?d.sdCommercial("cashReservas"):areaComercialHasPriority(d.d)?d.sdCommercial("cashReservas")||d.closer.cash_reservas||d.ledger.reservas||0:d.closer.cash_reservas||d.sdCommercial("cashReservas")||d.ledger.reservas||0;');
    expect(html).toContain('{l:"$ Venta HT",fn:d=>valorHTDay(d)||null,fmt:"$"}');
    expect(html).toContain('{l:"Recurring Cash",fn:d=>recurringDay(d)||null,fmt:"$"}');
    expect(html).toContain('{l:"$ Venta LT",fn:d=>cashLowTicketDay(d)||null,fmt:"$"}');
    expect(html).toContain('{l:"$ Cash Reservas",fn:d=>cashReservasDay(d)||null,fmt:"$"}');
    expect(html).not.toContain('const totalValorHT=totalValorHTFromCollaborators||sumF(closerEntries,"valor_venta_ht");');
    expect(html).not.toContain('const totalReservasManual=sumF(closerEntries,"cash_reservas")||totalReservasFromCollaborators;');
    expect(html).not.toContain('const dispLowT=cashApi?cashApi.lowTicket:totalValorLT;');
    expect(html).not.toContain('const totalRecurring=sumF(closerEntries,"recurring_cash");');
    expect(html).not.toContain('const mManualCashHT=dayData.reduce((s,d)=>s+(d.closer.ventas_cash||0),0)||dayData.reduce((s,d)=>s+d.sdCommercial("upfrontCash"),0);');
    expect(html).not.toContain('d.ledger.highTicket||d.closer.ventas_cash||d.sdCommercial("upfrontCash")');
    expect(html).not.toContain('const dispCash=cashApi&&cashApi.highTicket?cashApi.highTicket:totalCash;');
  });

  it("does not count active setter rows as commercial legacy closer rows", () => {
    expect(html).toContain('const COMMERCIAL_LEGACY_MEMBER_IDS=new Set(COMMERCIAL_COLLABORATORS.map(c=>c.legacy).filter(Boolean).filter(id=>!SETTER_MEMBER_IDS.has(id)));');
    expect(html).toContain('const COMMERCIAL_MEMBER_IDS=new Set([');
    expect(html).toContain('...COMMERCIAL_LEGACY_MEMBER_IDS,');
    expect(html).toContain('const isCommercialMember=m=>COMMERCIAL_MEMBER_IDS.has(m);');
    expect(html).not.toContain('...COMMERCIAL_COLLABORATORS.map(c=>c.legacy).filter(Boolean),');
  });

  it("counts all five High Ticket closers for June Agendas / Leads manual fields", () => {
    const collaboratorBlock = html.slice(html.indexOf('const CLOSER_COLLABORATORS=['), html.indexOf('const COMMERCIAL_COLLABORATORS='));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));

    expect(collaboratorBlock).toContain('{id:"Carlos Velez",label:"Carlos Velez",color:C.orange,role:"closer",legacy:"Carlos"}');
    expect(collaboratorBlock).toContain('{id:"Daryi Perez",label:"Daryi Perez",color:C.gold,role:"closer",legacy:"Daryi"}');
    expect(collaboratorBlock).toContain('{id:"Wiston Quintero",label:"Wiston Quintero",color:C.blue,role:"closer",legacy:"Juan Diego Afanador"}');
    expect(collaboratorBlock).toContain('{id:"Daniel Garcia Closer",label:"Daniel Garcia",color:C.blue,role:"closer",legacy:"Daniel Garcia"}');
    expect(collaboratorBlock).toContain('{id:"Alejandro Gallo Closer",label:"Alejandro Gallo",color:C.teal,role:"closer",legacy:"Alejandro Gallo"}');
    expect(html).toContain('const HIGH_TICKET_CLOSER_MEMBER_IDS=new Set(CLOSER_COLLABORATORS.map(c=>c.id));');
    expect(html).toContain('const isHighTicketCloserReportingMember=(m,date)=>isJune2026(date)?HIGH_TICKET_CLOSER_MEMBER_IDS.has(m):isCommercialReportingMember(m,date)&&!isAdminMember(m);');
    expect(detalleBlock).toContain('const highTicketCloserEntries=entries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,d));');
    expect(detalleBlock).toContain('const manualAgendasHoy=d=>d.sdHighTicketCloser("agendasHoy");');
    expect(detalleBlock).toContain('const manualCalificadas=d=>d.sdHighTicketCloser("calificadas");');
    expect(detalleBlock).toContain('const manualShowUps=d=>d.sdHighTicketCloser("showUps");');
    expect(torreBlock).toContain('const highTicketCloserMonthlyEntries=allowCommercialFallback?dailyEntries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,e.date)):[];');
    expect(html).not.toContain('const isHighTicketCloserReportingMember=(m,date)=>isCommercialReportingMember(m,date)&&!isAdminMember(m);');
  });

  it("limits Actividad Marketing to Lucas Soria and feeds Detalle Diario only from Lucas", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));
    const saveEntryBlock = html.slice(html.indexOf('const saveEntry=async'), html.indexOf('const saveCloserEntry=async'));

    expect(html).toContain('const MARKETING_ACTIVITY_MEMBER_ID="Lucas Soria";');
    expect(html).toContain('const isMarketingActivityMember=m=>m===MARKETING_ACTIVITY_MEMBER_ID;');
    expect(llenarBlock).toContain('const canEditMarketingActivity=isMarketingActivityMember(collabId);');
    expect(llenarBlock).toContain('{role==="setter"&&canEditMarketingActivity&&(');
    expect(detalleBlock).toContain('const mktEntries=entries.filter(e=>e&&isMarketingActivityMember(e.member));');
    expect(detalleBlock).toContain('{title:"Actividad Marketing",bg:"#6d28d9",rows:[');
    expect(detalleBlock).toContain('{l:"# IG Seguidores",fn:d=>d.sdMkt("igFollowers")||null,fmt:"n"}');
    expect(saveEntryBlock).toContain('const writesMarketingActivity=isMarketingActivityMember(entry.member);');
    expect(saveEntryBlock).toContain('ig_followers:writesMarketingActivity?(entry.igFollowers||0):isAdminMember(entry.member)?(entry.ventasLT||0):isCommercialMember(entry.member)?(entry.callsScheduled||0):0,');
    expect(saveEntryBlock).toContain('posts:writesMarketingActivity?(entry.posts||0):isAdminMember(entry.member)?(entry.valorVentaLT||0):isCommercialMember(entry.member)?(entry.outboundContactados||0):0,');
    expect(saveEntryBlock).toContain('mensajes:writesMarketingActivity?(entry.mensajes||0):isAdminMember(entry.member)?(entry.refunds||0):isCommercialMember(entry.member)?(entry.outboundAgendados||0):0,');
    expect(saveEntryBlock).toContain('bk_offers:writesMarketingActivity?(entry.bkOffers||0):isAdminMember(entry.member)?(entry.refundValue||0):isCommercialMember(entry.member)?(entry.hotLeads||0):0,');
    expect(detalleBlock).not.toContain('const mktEntries=entries.filter(e=>e&&!isCommercialMember(e.member)&&!isSetterMember(e.member));');
    expect(llenarBlock).not.toContain('{role==="setter"&&(\n        <>\n          <Card>\n            <STit icon="📱" title="Actividad del día"/>');
  });

  it("turns Actividad de llamadas High Ticket into a computed summary from collaborator Closers only", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const tablaBlock = html.slice(html.indexOf('const TablaMensual='), html.indexOf('const DetallePorDia='));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));
    const activityBlock = detalleBlock.slice(detalleBlock.indexOf('{title:"Actividad de llamadas'), detalleBlock.indexOf('{title:"Actividad de llamadas — Low Ticket"'));

    expect(llenarBlock).toContain('const noShowCalc=Math.max(0,(form.calificadas||0)-(form.showUps||0));');
    expect(llenarBlock).toContain('const normalizedCommercialForm=role==="closer"?{...form,agendas:noShowCalc}:form;');
    expect(llenarBlock).toContain('<STit icon="📞" title="Actividad de llamadas" sub="Resumen automático del reporte diario"/>');
    expect(llenarBlock).toContain('<Stat label="# Agendas hoy" value={fN(form.agendasHoy)} color={C.blue} size="sm"/>');
    expect(llenarBlock).toContain('<Stat label="# Show Ups" value={fN(form.showUps)} color={C.green} size="sm"/>');
    expect(llenarBlock).toContain('<Stat label="# Follow Ups contactados" value={fN(form.followUps)} color={C.amber} size="sm"/>');
    expect(llenarBlock).toContain('<Stat label="# Leads calientes" value={fN(form.pendAcumulados)} color={C.orange} size="sm"/>');
    expect(llenarBlock).not.toContain('<Inp label="# Llamadas / citas que tenías"');
    expect(llenarBlock).not.toContain('<Inp label="# Leads calientes" value={form.hotLeads}');
    const detallePorDiaBlock = html.slice(html.indexOf('const DetallePorDia='), html.indexOf('// ─── DETALLE COLABORADOR'));
    expect(tablaBlock).toContain('{l:"# Agendas hoy",k:"agendasHoy",fmt:"n"}');
    expect(tablaBlock).toContain('{l:"# Leads calientes",k:"pendAcumulados",fmt:"n"}');
    expect(tablaBlock).not.toContain('{l:"# Llamadas / citas que tenías",k:"callsScheduled",fmt:"n"}');
    expect(detallePorDiaBlock).toContain('{l:"# Agendas hoy",fn:d=>d.e?d.e.agendasHoy:0,fmt:"n"}');
    expect(detallePorDiaBlock).toContain('{l:"# Leads calientes",fn:d=>d.e?d.e.pendAcumulados:0,fmt:"n"}');
    expect(detallePorDiaBlock).not.toContain('{l:"# Llamadas / citas que tenías",fn:d=>d.e?d.e.callsScheduled:0,fmt:"n"}');
    expect(detalleBlock).toContain('const commercialEntries=entries.filter(e=>e&&isCommercialReportingMember(e.member,d));');
    expect(detalleBlock).toContain('const highTicketCloserEntries=entries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,d));');
    expect(activityBlock).toContain('{title:"Actividad de llamadas — High Ticket",bg:');
    expect(activityBlock).toContain('{l:"# Agendas hoy",fn:d=>d.sdHighTicketCloser("agendasHoy")||null,fmt:"n"}');
    expect(activityBlock).toContain('{l:"# Show Ups",fn:d=>d.sdHighTicketCloser("showUps")||null,fmt:"n"}');
    expect(activityBlock).toContain('{l:"# Follow Ups contactados",fn:d=>d.sdHighTicketCloser("followUps")||null,fmt:"n"}');
    expect(activityBlock).toContain('{l:"# Leads calientes",fn:d=>d.sdHighTicketCloser("pendAcumulados")||null,fmt:"n"}');
    expect(activityBlock).not.toContain('sdCommercialActivity(');
    expect(activityBlock).not.toContain('fn:d=>d.sdCommercial("agendasHoy")');
    expect(activityBlock).not.toContain('daily_closer');
  });

  it("feeds Agendas / Leads High Ticket from manual Agendas plus collaborator Closers only", () => {
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));
    const agendasBlock = detalleBlock.slice(detalleBlock.indexOf('{title:"Agendas / Leads High Ticket"'), detalleBlock.indexOf('{title:"Costos por Lead"'));

    expect(detalleBlock).toContain('const highTicketCloserEntries=entries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,d));');
    expect(detalleBlock).toContain('const sdHighTicketCloser=f=>sumF(highTicketCloserEntries,f);');
    expect(detalleBlock).toContain('const manualAgendasHoy=d=>d.sdHighTicketCloser("agendasHoy");');
    expect(detalleBlock).toContain('const manualCalificadas=d=>d.sdHighTicketCloser("calificadas");');
    expect(detalleBlock).toContain('const manualShowUps=d=>d.sdHighTicketCloser("showUps");');
    expect(agendasBlock).toContain('{title:"Agendas / Leads High Ticket",bg:');
    expect(agendasBlock).toContain('{l:"Agendas Total",fn:d=>agTotal(d)||null,fmt:"n"}');
    expect(agendasBlock).toContain('{l:"Orgánicas",fn:d=>d.closer.agendas_organicas||null,fmt:"n",sub:true}');
    expect(agendasBlock).toContain('{l:"Meta",fn:d=>d.closer.agendas_meta||null,fmt:"n",sub:true}');
    expect(agendasBlock).toContain('{l:"Google",fn:d=>d.closer.agendas_google||null,fmt:"n",sub:true}');
    expect(agendasBlock).toContain('{l:"TikTok",fn:d=>d.closer.agendas_tiktok||null,fmt:"n",sub:true}');
    expect(agendasBlock).toContain('{l:"Otros",fn:d=>d.closer.agendas_otros||null,fmt:"n",sub:true}');
    expect(agendasBlock).toContain('{l:"Hoy (en agenda)",fn:d=>manualAgendasHoy(d)||null,fmt:"n"}');
    expect(agendasBlock).toContain('{l:"Calificadas Total",fn:d=>manualCalificadas(d)||null,fmt:"n"}');
    expect(agendasBlock).toContain('{l:"Show Ups",fn:d=>manualShowUps(d)||null,fmt:"n"}');
    expect(detalleBlock).not.toContain('const manualAgendasHoy=d=>d.hasPrimaryCommercial?');
    expect(detalleBlock).not.toContain('const manualCalificadas=d=>d.hasPrimaryCommercial?');
    expect(detalleBlock).not.toContain('const manualShowUps=d=>d.hasPrimaryCommercial?');
  });

  it("adds Alejandro Gallo Low Ticket call activity and shows it before Métricas Setter in Detalle Diario", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const setterFormBlock = llenarBlock.slice(llenarBlock.indexOf('<STit icon="💬" title="Reporte de Setter"'));
    const detalleBlock = html.slice(html.indexOf('const DetalleView='), html.indexOf('const HDR_BG=IS_DARK?'));
    const lowTicketBlock = detalleBlock.slice(detalleBlock.indexOf('{title:"Actividad de llamadas — Low Ticket"'), detalleBlock.indexOf('{title:"Métricas Setter"'));
    const saveEntryBlock = html.slice(html.indexOf('const saveEntry=async'), html.indexOf('const saveCloserEntry=async'));

    expect(html).toContain('const LOW_TICKET_SETTER_MEMBER_ID="Alejandro Gallo";');
    expect(html).toContain('const isLowTicketSetter=m=>m===LOW_TICKET_SETTER_MEMBER_ID;');
    expect(html).toContain('lowTicketVentas:0,lowTicketAgendasHoy:0,lowTicketShowUps:0,lowTicketFollowUps:0,');
    expect(setterFormBlock).toContain('{isLowTicketSetter(collabId)&&(');
    expect(setterFormBlock).toContain('<STit icon="📞" title="Actividad de llamadas Low Ticket" sub="Solo Alejandro Gallo"/>');
    expect(setterFormBlock).toContain('<Inp label="# Ventas" value={form.lowTicketVentas} onChange={v=>sf("lowTicketVentas",v)}/>');
    expect(setterFormBlock).toContain('<Inp label="# Agendas hoy" value={form.lowTicketAgendasHoy} onChange={v=>sf("lowTicketAgendasHoy",v)}/>');
    expect(setterFormBlock).toContain('<Inp label="# Show Ups" value={form.lowTicketShowUps} onChange={v=>sf("lowTicketShowUps",v)}/>');
    expect(setterFormBlock).toContain('<Inp label="# Follow Ups contactados" value={form.lowTicketFollowUps} onChange={v=>sf("lowTicketFollowUps",v)}/>');
    expect(detalleBlock).toContain('const lowTicketEntries=setterEntries.filter(e=>e&&isLowTicketSetter(e.member));');
    expect(detalleBlock).toContain('const sdLowTicket=f=>sumF(lowTicketEntries,f);');
    expect(detalleBlock.indexOf('{title:"Actividad de llamadas — Low Ticket"')).toBeGreaterThan(detalleBlock.indexOf('{title:"Actividad de llamadas — High Ticket"'));
    expect(detalleBlock.indexOf('{title:"Actividad de llamadas — Low Ticket"')).toBeLessThan(detalleBlock.indexOf('{title:"Métricas Setter"'));
    expect(lowTicketBlock).toContain('{l:"# Ventas",fn:d=>d.sdLowTicket("lowTicketVentas")||null,fmt:"n"}');
    expect(lowTicketBlock).toContain('{l:"# Agendas hoy",fn:d=>d.sdLowTicket("lowTicketAgendasHoy")||null,fmt:"n"}');
    expect(lowTicketBlock).toContain('{l:"# Show Ups",fn:d=>d.sdLowTicket("lowTicketShowUps")||null,fmt:"n"}');
    expect(lowTicketBlock).toContain('{l:"# Follow Ups contactados",fn:d=>d.sdLowTicket("lowTicketFollowUps")||null,fmt:"n"}');
    expect(saveEntryBlock).toContain('const writesLowTicketActivity=isLowTicketSetter(entry.member);');
    expect(saveEntryBlock).toContain('revenue_organic:writesLowTicketActivity?(entry.lowTicketVentas||0):(entry.valorVentaHT||0),');
    expect(saveEntryBlock).toContain('cash_organic:writesLowTicketActivity?(entry.lowTicketAgendasHoy||0):(entry.cashCollected||entry.upfrontCash||0),');
    expect(saveEntryBlock).toContain('recurring_organic:writesLowTicketActivity?(entry.lowTicketShowUps||0):(entry.recurringCash||0),');
    expect(saveEntryBlock).toContain('pitches_paid:writesLowTicketActivity?(entry.lowTicketFollowUps||0):(entry.pendAcumulados||0),');
  });

  it("splits Area Comercial report entry into Admin, active Setters, and Closers sub-tabs", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const activeSetterBlock = html.slice(html.indexOf('const SETTER_COLLABORATORS=['), html.indexOf('const INACTIVE_SETTER_COLLABORATORS=['));
    const inactiveSetterBlock = html.slice(html.indexOf('const INACTIVE_SETTER_COLLABORATORS=['), html.indexOf('const CLOSER_COLLABORATORS=['));

    expect(html).toContain('const SETTER_COLLABORATORS=[');
    expect(activeSetterBlock).toContain('{id:"Alejandro Gallo",label:"Alejandro Gallo",color:C.teal,role:"setter"}');
    expect(activeSetterBlock).toContain('{id:"Daniel Garcia",label:"Daniel Garcia",color:C.blue,role:"setter"}');
    expect(activeSetterBlock).toContain('{id:"Luisa Vega",label:"Luisa Vega",color:C.pink,role:"setter"}');
    expect(activeSetterBlock).toContain('{id:"Lucas Soria",label:"Lucas Soria",color:C.green,role:"setter"}');
    expect(activeSetterBlock).not.toContain('Karen Anquiz');
    expect(inactiveSetterBlock).toContain('{id:"Karen Setter",label:"Karen Anquiz",color:C.purple,role:"setter",displayRole:"Setter"}');
    expect(html).toContain('{id:"Daniel Garcia Closer",label:"Daniel Garcia",color:C.blue,role:"closer",legacy:"Daniel Garcia"}');
    expect(html).toContain('{id:"Alejandro Gallo Closer",label:"Alejandro Gallo",color:C.teal,role:"closer",legacy:"Alejandro Gallo"}');
    expect(html).toContain('{id:"Daryi Perez",label:"Daryi Perez",color:C.gold,role:"closer",legacy:"Daryi"}');
    expect(html).toContain('const REPORT_GROUPS={');
    expect(html).toContain('admin:{label:"Admin",collaborators:ADMIN_COLLABORATORS}');
    expect(html).toContain('setters:{label:"Setters",collaborators:SETTER_COLLABORATORS}');
    expect(html).toContain('closers:{label:"Closers",collaborators:CLOSER_COLLABORATORS}');
    expect(html).not.toContain('marketing:{label:"Marketing",collaborators:MARKETING_COLLABORATORS}');
    expect(llenarBlock).toContain('{Object.entries(REPORT_GROUPS).map(([key,g])=>(');
  });

  it("renames closer Agendas / Leads fields and calculates No Show from confirmed minus show ups", () => {
    const llenarBlock = html.slice(html.indexOf('const LlenarReporte='), html.indexOf('// ─── TABLA MENSUAL'));
    const tablaBlock = html.slice(html.indexOf('const TablaMensual='), html.indexOf('const DetallePorDia='));

    expect(llenarBlock).toContain('<Inp label="# Agendas hoy" value={form.agendasHoy} onChange={v=>sf("agendasHoy",v)}/>');
    expect(llenarBlock).toContain('<Inp label="# Calificadas / Agendas Confirmadas" value={form.calificadas} onChange={v=>sf("calificadas",v)}/>');
    expect(llenarBlock).toContain('<Inp label="# Show Ups" value={form.showUps} onChange={v=>sf("showUps",v)}/>');
    expect(html).toContain('const CalcBox=({label,value,color=C.red,hint="Automático"})=>(');
    expect(llenarBlock).toContain('<CalcBox label="# No Show" value={fN(noShowCalc)} color={C.red}/>');
    expect(llenarBlock).not.toContain('<Stat label="# No Show" value={fN(noShowCalc)} color={C.red} size="sm"/>');
    expect(llenarBlock).not.toContain('<Inp label="# No Show" value={form.agendas}');
    expect(llenarBlock).not.toContain('<Inp label="# Cualificadas"');
    expect(tablaBlock).toContain('{l:"# Calificadas / Agendas Confirmadas",k:"calificadas",fmt:"n"}');
    expect(tablaBlock).toContain('{l:"# No Show",k:"agendas",fmt:"n"}');
  });

  it("replicates the marketing daily activity card as the first setter section", () => {
    const setterBlock = html.slice(html.indexOf('{role==="setter"&&('), html.indexOf('{role==="closer"&&('));
    const activityIndex = setterBlock.indexOf('<STit icon="📱" title="Actividad del día"/>');
    const reportIndex = setterBlock.indexOf('<STit icon="💬" title="Reporte de Setter" sub="Qué pasó con tus conversaciones"/>');

    expect(activityIndex).toBeGreaterThanOrEqual(0);
    expect(reportIndex).toBeGreaterThanOrEqual(0);
    expect(activityIndex).toBeLessThan(reportIndex);
    expect(setterBlock).toContain('<Inp label="# IG Seguidores" value={form.igFollowers} onChange={v=>sf("igFollowers",v)}/>');
    expect(setterBlock).toContain('<Inp label="# Posts + CTA" value={form.posts} onChange={v=>sf("posts",v)}/>');
    expect(setterBlock).toContain('<Inp label="# Mensajes Diarios" value={form.mensajes} onChange={v=>sf("mensajes",v)}/>');
    expect(setterBlock).toContain('<Inp label="# Follow Ups" value={form.followUps} onChange={v=>sf("followUps",v)}/>');
    expect(setterBlock).toContain('<Inp label="# Booking Offers" value={form.bkOffers} onChange={v=>sf("bkOffers",v)}/>');
  });

  it("removes the unused Marketing tab from the main and mobile left menus", () => {
    const tabsBlock = html.slice(html.indexOf('const TABS=['), html.indexOf('const MOBILE_TABS=['));
    const mobileTabsBlock = html.slice(html.indexOf('const MOBILE_TABS=['), html.indexOf('const App='));

    expect(tabsBlock).not.toContain('{id:"entrada", l:"Marketing"');
    expect(tabsBlock).not.toContain('l:"Marketing"');
    expect(mobileTabsBlock).not.toContain('TABS.find(t=>t.id==="entrada")');
  });

  it("orders the first left-menu tabs for the operations workflow", () => {
    const tabsBlock = html.slice(html.indexOf('const TABS=['), html.indexOf('const MOBILE_TABS=['));
    const expectedOrder = [
      'l:"Torre CEO"',
      'l:"Area Comercial"',
      'l:"Agendas / Leads"',
      'l:"Control Comercial"',
      'l:"Operaciones"',
      'l:"Comunidad Dropi"',
      'l:"Detalle Diario"',
    ];
    const positions = expectedOrder.map((needle) => tabsBlock.indexOf(needle));

    positions.forEach((position) => expect(position).toBeGreaterThanOrEqual(0));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
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
    const setterStart = llenarBlock.indexOf('{role==="setter"&&(');
    const setterBlock = llenarBlock.slice(setterStart, llenarBlock.indexOf('{isValentina&&(', setterStart));
    expect(setterBlock).toContain('<STit icon="📝" title="Notas del setter" sub="Contexto cualitativo del reporte manual"/>');
    expect(setterBlock).toContain('<Txt label="Notas/acciones importantes de los showups" value={form.showupNotes} onChange={v=>st("showupNotes",v)} placeholder="Ej: AM mostró intención alta, revisar grabación Fathom y enviar plan de pago..."/>');
    expect(setterBlock).toContain('<Txt label="Evidencia manual de leads calientes" value={form.hotLeadsEvidence} onChange={v=>st("hotLeadsEvidence",v)} placeholder="Ej: Iniciales + razón: showup + Fathom HOT/WARM, pipeline seguimiento, reserva pendiente..."/>');
    expect(setterBlock).toContain('<Txt label="Bloqueos o contexto que Jose debe saber" value={form.blockers} onChange={v=>st("blockers",v)}/>');
    expect(setterBlock).not.toContain('<Txt label="Hallazgos importantes" value={form.setterFindings}');
    expect(llenarBlock).toContain('{isValentina&&(');
    expect(llenarBlock).toContain('{!isValentina&&role==="closer"&&(');
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
    expect(html).toContain('"2026-05-31":{scheduled:1,qualified:10,showed:17,cancelled:0}');
    expect(html).toContain("agendas_calificadas:r.qualified??Math.max(0,(r.scheduled||0)-(r.cancelled||0))");
    expect(html).toContain("agendas_final:r.scheduled||0");
    expect(html).toContain("citas_asistidas:r.showed||0");
  });

  it("orders and renames Detalle Diario Agendas / Leads rows around GHL-derived fields", () => {
    const agendasBlock = html.slice(
      html.indexOf('{title:"Agendas / Leads High Ticket",bg:'),
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

  it("calculates Torre CEO Funnel a hoy required values from the prorated day target", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    const funnelBlock = html.slice(html.indexOf("const funnelRows=["), html.indexOf("const handleSaveCfg=async"));

    expect(torreBlock).toContain("const ventasReqHoy=ticketProm>0?metaEsperadaHoy/ticketProm:0;");
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
    expect(funnelBlock).toContain('{l:"Ventas $ (comprometido)",req:metaEsperadaHoy,real:totalValor,fmt:"$"}');
    expect(funnelBlock).toContain('{l:"Ventas (unidades)",req:ventasReqHoy,real:totalVentas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas Show Up (asistidas)",req:asistidasReqHoy,real:totalAsistidas,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Leads calificados reales",req:leadsCalificadosDisplayReqHoy,real:totalLeads,fmt:"n"}');
    expect(funnelBlock).toContain('{l:"Citas agendadas reales",req:citasAgendadasDisplayReqHoy,real:totalAgendas,fmt:"n"}');
    expect(funnelBlock).not.toContain('l:"Citas asistidas"');
    expect(funnelBlock).not.toContain('l:"Citas agend. calificadas"');
    expect(funnelBlock).not.toContain('l:"Leads calificados"');
  });

  it("keeps Agendas / Leads as a manual-only daily_closer entry screen", () => {
    const loadBlock = html.slice(html.indexOf('const [{data:kpiRows'), html.indexOf('const kk=`kpi:${year}-${month}`'));
    const saveEntryBlock = html.slice(html.indexOf('const saveEntry=async'), html.indexOf('const saveCloserEntry=async'));
    const saveCloserBlock = html.slice(html.indexOf('const saveCloserEntry=async'), html.indexOf('const saveKpiConfig=async'));
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));

    expect(html).toContain("// Agendas / Leads is manual-only daily_closer; Detalle Diario commercial totals come from Área Comercial.");
    expect(loadBlock).toContain('db.from("daily_closer").select("*")');
    expect(loadBlock).toContain('setCloserData(closerObj);');
    expect(loadBlock).not.toContain('setCloserData(applyGhlCaptacionAgendasLeads(closerObj));');
    expect(saveCloserBlock).toContain('setCloserData(nd);');
    expect(saveCloserBlock).not.toContain('setCloserData(applyGhlCaptacionAgendasLeads(nd));');
    expect(saveCloserBlock).toContain('await db.from("daily_closer").upsert({');
    expect(saveCloserBlock).toContain('{onConflict:"date"}');
    expect(saveEntryBlock).not.toContain('aggregateCommercialEntriesForCloser');
    expect(saveEntryBlock).not.toContain('saveCloserEntry(entry.date');
    expect(torreBlock).toContain('const closerEntries=Object.entries(allCloser).filter(([k])=>k.startsWith(prefix)).map(([,v])=>v);');
    expect(torreBlock).toContain('const totalValor=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialMoneyDay(date,allCloser[date]).valorHT,0);');
    expect(torreBlock).toContain('const totalVentas=monthlyCommercialMoneyDates.reduce((s,date)=>s+monthlyCommercialSalesDay(date,allCloser[date]),0);');
    expect(torreBlock).toContain('const highTicketCloserMonthlyEntries=allowCommercialFallback?dailyEntries.filter(e=>e&&isHighTicketCloserReportingMember(e.member,e.date)):[];');
    expect(torreBlock).toContain('const totalAgendas=totalAgendasFromDetalle||sumF(closerEntries,"agendas_final");');
    expect(torreBlock).toContain('const totalLeads=totalLeadsFromDetalle||sumF(closerEntries,"agendas_calificadas");');
    expect(torreBlock).toContain('const totalAsistidas=totalShowsFromDetalle||sumF(closerEntries,"citas_asistidas");');
    expect(torreBlock).not.toContain('const totalAgendas=Math.max(totalAgendasCampo,totalLeadsCampo);');
    expect(torreBlock).not.toContain('const totalLeads=Math.min(totalAgendasCampo,totalLeadsCampo);');
  });

  it("calculates Salud del embudo ratios from the corrected Torre CEO denominators", () => {
    const torreBlock = html.slice(html.indexOf("const Torre="), html.indexOf("const handleSaveCfg=async"));
    expect(torreBlock).toContain("const pctLeadsAgReal=totalAgendas>0?pv(totalLeads,totalAgendas):null;");
    expect(torreBlock).toContain("const pctAgAsisReal=totalLeads>0?pv(totalAsistidas,totalLeads):null;");
    expect(torreBlock).toContain("const closeRateReal=totalAsistidas>0?pv(totalVentas,totalAsistidas):null;");
    expect(torreBlock).not.toContain("const pctLeadsAgReal=totalLeads>0?pv(totalAgendas,totalLeads):null;");
    expect(torreBlock).not.toContain("const pctAgAsisReal=totalAgendas>0?pv(totalAsistidas,totalAgendas):null;");
    expect(html).toContain('l:"% Leads → Agendadas",meta:pctLeadsAg,real:pctLeadsAgReal');
  });
});
