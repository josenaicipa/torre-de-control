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
});
