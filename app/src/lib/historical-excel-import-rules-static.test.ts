import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");

type ImportPayload = {
  tables: {
    daily_closer: Array<{
      date: string;
      agendas_otros?: number;
      cal_otros?: number;
      hoy_otros?: number;
      show_otros?: number;
      agendas_calificadas?: number;
      agendas_final?: number;
      citas_asistidas?: number;
      q_ventas_ht?: number;
      valor_venta_ht?: number;
      ventas_cash?: number;
    }>;
  };
};

const HISTORICAL_EXCEL_MONTHS = [
  {
    label: "January 2026",
    file: "imports/torre_import_daily_closer_january_2026_from_excel_historico.json",
    expectedDays: 31,
    expectedFirstDate: "2026-01-01",
    expectedLastDate: "2026-01-31",
    totals: {
      agendas: 678,
      calificadas: 509,
      hoy: 260,
      show: 177,
      ventasHt: 24,
      valorHt: 72700,
      cash: 58142,
    },
  },
  {
    label: "February 2026",
    file: "imports/torre_import_daily_closer_february_2026_from_excel_historico.json",
    expectedDays: 28,
    expectedFirstDate: "2026-02-01",
    expectedLastDate: "2026-02-28",
    totals: {
      agendas: 810,
      calificadas: 675,
      hoy: 312,
      show: 209,
      ventasHt: 29,
      valorHt: 85800,
      cash: 64459,
    },
  },
  {
    label: "March 2026",
    file: "imports/torre_import_daily_closer_march_2026_from_excel_historico.json",
    expectedDays: 31,
    expectedFirstDate: "2026-03-01",
    expectedLastDate: "2026-03-31",
    totals: {
      agendas: 825,
      calificadas: 687,
      hoy: 281,
      show: 190,
      ventasHt: 43,
      valorHt: 139550,
      cash: 79507,
    },
  },
];

describe("January-March 2026 historical Excel import rules", () => {
  it("uses Juan-approved historical Excel totals and keeps homologated Torre fields in sync", () => {
    for (const month of HISTORICAL_EXCEL_MONTHS) {
      const payload = JSON.parse(readFileSync(resolve(repoRoot, month.file), "utf8")) as ImportPayload;
      const rows = payload.tables.daily_closer;

      expect(rows, month.label).toHaveLength(month.expectedDays);
      expect(rows[0]?.date, month.label).toBe(month.expectedFirstDate);
      expect(rows.at(-1)?.date, month.label).toBe(month.expectedLastDate);

      for (const row of rows) {
        expect(row.cal_otros, `${month.label} ${row.date} cal_otros mirror`).toBe(row.agendas_calificadas);
        expect(row.hoy_otros, `${month.label} ${row.date} hoy_otros mirror`).toBe(row.agendas_final);
        expect(row.show_otros, `${month.label} ${row.date} show_otros mirror`).toBe(row.citas_asistidas);

        for (const value of [
          row.agendas_otros,
          row.agendas_calificadas,
          row.agendas_final,
          row.citas_asistidas,
          row.q_ventas_ht,
          row.valor_venta_ht,
          row.ventas_cash,
        ]) {
          expect(Number.isInteger(value), `${month.label} ${row.date} integer historical value`).toBe(true);
        }
      }

      const totals = rows.reduce(
        (sum, row) => ({
          agendas: sum.agendas + (row.agendas_otros ?? 0),
          calificadas: sum.calificadas + (row.agendas_calificadas ?? 0),
          hoy: sum.hoy + (row.agendas_final ?? 0),
          show: sum.show + (row.citas_asistidas ?? 0),
          ventasHt: sum.ventasHt + (row.q_ventas_ht ?? 0),
          valorHt: sum.valorHt + (row.valor_venta_ht ?? 0),
          cash: sum.cash + (row.ventas_cash ?? 0),
        }),
        { agendas: 0, calificadas: 0, hoy: 0, show: 0, ventasHt: 0, valorHt: 0, cash: 0 },
      );

      expect(totals, month.label).toEqual(month.totals);
    }
  });
});
