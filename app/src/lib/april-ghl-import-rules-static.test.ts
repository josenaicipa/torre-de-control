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
    }>;
  };
};

const APRIL_2026_FILTERED_AGENDAS: Record<
  string,
  { agendas: number; hoy: number; canceladas: number; show: number }
> = {
  "2026-04-01": { agendas: 11, hoy: 16, canceladas: 10, show: 5 },
  "2026-04-02": { agendas: 23, hoy: 0, canceladas: 0, show: 0 },
  "2026-04-03": { agendas: 12, hoy: 1, canceladas: 1, show: 0 },
  "2026-04-04": { agendas: 16, hoy: 14, canceladas: 12, show: 2 },
  "2026-04-05": { agendas: 18, hoy: 0, canceladas: 0, show: 0 },
  "2026-04-06": { agendas: 31, hoy: 32, canceladas: 27, show: 1 },
  "2026-04-07": { agendas: 23, hoy: 29, canceladas: 21, show: 5 },
  "2026-04-08": { agendas: 22, hoy: 39, canceladas: 32, show: 4 },
  "2026-04-09": { agendas: 16, hoy: 27, canceladas: 22, show: 3 },
  "2026-04-10": { agendas: 17, hoy: 30, canceladas: 22, show: 4 },
  "2026-04-11": { agendas: 12, hoy: 1, canceladas: 1, show: 0 },
  "2026-04-12": { agendas: 19, hoy: 0, canceladas: 0, show: 0 },
  "2026-04-13": { agendas: 19, hoy: 27, canceladas: 21, show: 3 },
  "2026-04-14": { agendas: 26, hoy: 28, canceladas: 23, show: 3 },
  "2026-04-15": { agendas: 26, hoy: 24, canceladas: 19, show: 5 },
  "2026-04-16": { agendas: 15, hoy: 22, canceladas: 16, show: 2 },
  "2026-04-17": { agendas: 19, hoy: 19, canceladas: 12, show: 2 },
  "2026-04-18": { agendas: 12, hoy: 24, canceladas: 17, show: 1 },
  "2026-04-19": { agendas: 18, hoy: 0, canceladas: 0, show: 0 },
  "2026-04-20": { agendas: 26, hoy: 28, canceladas: 20, show: 2 },
  "2026-04-21": { agendas: 23, hoy: 28, canceladas: 19, show: 2 },
  "2026-04-22": { agendas: 33, hoy: 24, canceladas: 19, show: 4 },
  "2026-04-23": { agendas: 16, hoy: 27, canceladas: 20, show: 2 },
  "2026-04-24": { agendas: 27, hoy: 23, canceladas: 11, show: 9 },
  "2026-04-25": { agendas: 20, hoy: 21, canceladas: 17, show: 1 },
  "2026-04-26": { agendas: 21, hoy: 0, canceladas: 0, show: 0 },
  "2026-04-27": { agendas: 28, hoy: 38, canceladas: 30, show: 5 },
  "2026-04-28": { agendas: 28, hoy: 31, canceladas: 26, show: 1 },
  "2026-04-29": { agendas: 21, hoy: 27, canceladas: 19, show: 5 },
  "2026-04-30": { agendas: 21, hoy: 32, canceladas: 24, show: 4 },
};

describe("April 2026 GHL Agendas / Leads import rule", () => {
  it("uses only Juan-approved calendars and calculates Calificadas Total as Hoy minus cancelled appointments", () => {
    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_april_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    expect(payload.tables.daily_closer).toHaveLength(30);

    for (const [date, source] of Object.entries(APRIL_2026_FILTERED_AGENDAS)) {
      const expectedCalificadas = Math.max(0, source.hoy - source.canceladas);
      const payloadRow = payload.tables.daily_closer.find((row) => row.date === date);

      expect(payloadRow, `missing import payload row for ${date}`).toBeDefined();
      expect(payloadRow?.agendas_otros).toBe(source.agendas);
      expect(payloadRow?.agendas_final).toBe(source.hoy);
      expect(payloadRow?.hoy_otros).toBe(source.hoy);
      expect(payloadRow?.agendas_calificadas).toBe(expectedCalificadas);
      expect(payloadRow?.cal_otros).toBe(expectedCalificadas);
      expect(payloadRow?.citas_asistidas).toBe(source.show);
      expect(payloadRow?.show_otros).toBe(source.show);
    }

    const totals = payload.tables.daily_closer.reduce(
      (sum, row) => ({
        agendas: sum.agendas + (row.agendas_otros ?? 0),
        hoy: sum.hoy + (row.agendas_final ?? 0),
        calificadas: sum.calificadas + (row.agendas_calificadas ?? 0),
        show: sum.show + (row.citas_asistidas ?? 0),
      }),
      { agendas: 0, hoy: 0, calificadas: 0, show: 0 },
    );

    expect(totals).toEqual({ agendas: 619, hoy: 612, calificadas: 151, show: 75 });
  });
});
