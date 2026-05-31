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

const MAY_2026_FILTERED_AGENDAS: Record<
  string,
  { agendas: number; hoy: number; canceladas: number; show: number }
> = {
  "2026-05-01": { agendas: 17, hoy: 1, canceladas: 1, show: 0 },
  "2026-05-02": { agendas: 22, hoy: 15, canceladas: 9, show: 2 },
  "2026-05-03": { agendas: 22, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-04": { agendas: 26, hoy: 34, canceladas: 27, show: 2 },
  "2026-05-05": { agendas: 20, hoy: 33, canceladas: 26, show: 4 },
  "2026-05-06": { agendas: 29, hoy: 27, canceladas: 18, show: 5 },
  "2026-05-07": { agendas: 18, hoy: 33, canceladas: 18, show: 8 },
  "2026-05-08": { agendas: 15, hoy: 22, canceladas: 18, show: 2 },
  "2026-05-09": { agendas: 16, hoy: 14, canceladas: 13, show: 0 },
  "2026-05-10": { agendas: 16, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-11": { agendas: 10, hoy: 28, canceladas: 16, show: 6 },
  "2026-05-12": { agendas: 20, hoy: 20, canceladas: 8, show: 3 },
  "2026-05-13": { agendas: 20, hoy: 19, canceladas: 8, show: 3 },
  "2026-05-14": { agendas: 14, hoy: 16, canceladas: 8, show: 8 },
  "2026-05-15": { agendas: 5, hoy: 15, canceladas: 6, show: 5 },
  "2026-05-16": { agendas: 13, hoy: 8, canceladas: 3, show: 2 },
  "2026-05-17": { agendas: 10, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-18": { agendas: 15, hoy: 15, canceladas: 9, show: 3 },
  "2026-05-19": { agendas: 18, hoy: 19, canceladas: 11, show: 3 },
  "2026-05-20": { agendas: 11, hoy: 23, canceladas: 15, show: 4 },
  "2026-05-21": { agendas: 22, hoy: 24, canceladas: 11, show: 7 },
  "2026-05-22": { agendas: 13, hoy: 11, canceladas: 6, show: 1 },
  "2026-05-23": { agendas: 7, hoy: 12, canceladas: 7, show: 2 },
  "2026-05-24": { agendas: 15, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-25": { agendas: 18, hoy: 21, canceladas: 6, show: 4 },
  "2026-05-26": { agendas: 19, hoy: 23, canceladas: 14, show: 7 },
  "2026-05-27": { agendas: 19, hoy: 10, canceladas: 6, show: 2 },
  "2026-05-28": { agendas: 23, hoy: 23, canceladas: 15, show: 4 },
  "2026-05-29": { agendas: 5, hoy: 16, canceladas: 10, show: 2 },
  "2026-05-30": { agendas: 0, hoy: 14, canceladas: 4, show: 0 },
  "2026-05-31": { agendas: 0, hoy: 0, canceladas: 0, show: 0 },
};

describe("May 2026 GHL Agendas / Leads import rule", () => {
  it("uses only Juan-approved calendars and calculates Calificadas Total as Hoy minus cancelled appointments", () => {
    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_may_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    for (const [date, source] of Object.entries(MAY_2026_FILTERED_AGENDAS)) {
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

    expect(totals).toEqual({ agendas: 478, hoy: 496, calificadas: 203, show: 89 });
  });

  it("keeps the production static GHL override aligned with the final import payload", () => {
    const html = readFileSync(resolve(repoRoot, "app/public/index.html"), "utf8");
    const match = html.match(/const GHL_CAPTACION_MAY_2026_APPOINTMENTS=(\{[\s\S]*?\n\});/);
    expect(match, "missing frontend GHL override block").toBeTruthy();

    const frontendRows = Function(`return (${match?.[1] ?? "{}"});`)() as Record<
      string,
      { scheduled: number; showed: number; cancelled: number }
    >;

    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_may_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    for (const row of payload.tables.daily_closer) {
      expect(frontendRows[row.date], `missing frontend row for ${row.date}`).toEqual({
        scheduled: row.agendas_final ?? 0,
        showed: row.citas_asistidas ?? 0,
        cancelled: Math.max(0, (row.agendas_final ?? 0) - (row.agendas_calificadas ?? 0)),
      });
    }
  });
});
