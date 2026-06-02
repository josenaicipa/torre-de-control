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
  { agendas: number; hoy: number; canceladas: number; show: number; calificadas?: number }
> = {
  "2026-05-01": { agendas: 19, hoy: 1, canceladas: 1, show: 0 },
  "2026-05-02": { agendas: 24, hoy: 17, canceladas: 10, show: 2 },
  "2026-05-03": { agendas: 23, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-04": { agendas: 32, hoy: 39, canceladas: 27, show: 5 },
  "2026-05-05": { agendas: 22, hoy: 37, canceladas: 27, show: 6 },
  "2026-05-06": { agendas: 35, hoy: 31, canceladas: 18, show: 9 },
  "2026-05-07": { agendas: 21, hoy: 36, canceladas: 20, show: 9 },
  "2026-05-08": { agendas: 15, hoy: 26, canceladas: 20, show: 3 },
  "2026-05-09": { agendas: 18, hoy: 15, canceladas: 13, show: 0 },
  "2026-05-10": { agendas: 17, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-11": { agendas: 14, hoy: 32, canceladas: 18, show: 6 },
  "2026-05-12": { agendas: 23, hoy: 23, canceladas: 9, show: 4 },
  "2026-05-13": { agendas: 23, hoy: 22, canceladas: 11, show: 3 },
  "2026-05-14": { agendas: 18, hoy: 19, canceladas: 9, show: 9 },
  "2026-05-15": { agendas: 12, hoy: 21, canceladas: 6, show: 8 },
  "2026-05-16": { agendas: 14, hoy: 10, canceladas: 4, show: 2 },
  "2026-05-17": { agendas: 10, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-18": { agendas: 18, hoy: 17, canceladas: 9, show: 3 },
  "2026-05-19": { agendas: 19, hoy: 24, canceladas: 12, show: 4 },
  "2026-05-20": { agendas: 12, hoy: 24, canceladas: 15, show: 5 },
  "2026-05-21": { agendas: 27, hoy: 26, canceladas: 11, show: 8 },
  "2026-05-22": { agendas: 14, hoy: 14, canceladas: 6, show: 4 },
  "2026-05-23": { agendas: 10, hoy: 15, canceladas: 7, show: 3 },
  "2026-05-24": { agendas: 16, hoy: 0, canceladas: 0, show: 0 },
  "2026-05-25": { agendas: 19, hoy: 25, canceladas: 6, show: 9 },
  "2026-05-26": { agendas: 24, hoy: 24, canceladas: 14, show: 8 },
  "2026-05-27": { agendas: 21, hoy: 15, canceladas: 7, show: 4 },
  "2026-05-28": { agendas: 24, hoy: 25, canceladas: 15, show: 5 },
  "2026-05-29": { agendas: 17, hoy: 21, canceladas: 11, show: 5 },
  "2026-05-30": { agendas: 21, hoy: 16, canceladas: 12, show: 2 },
  "2026-05-31": { agendas: 6, hoy: 1, canceladas: 0, show: 17, calificadas: 10 },
};

describe("May 2026 GHL Agendas / Leads import rule", () => {
  it("uses Juan-approved six calendars and calculates Calificadas Total as Hoy minus cancelled appointments", () => {
    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_may_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    expect(payload.tables.daily_closer).toHaveLength(31);

    for (const [date, source] of Object.entries(MAY_2026_FILTERED_AGENDAS)) {
      const expectedCalificadas = source.calificadas ?? Math.max(0, source.hoy - source.canceladas);
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

    expect(totals).toEqual({ agendas: 588, hoy: 576, calificadas: 267, show: 143 });
  });

  it("keeps the production static GHL override aligned with the final import payload", () => {
    const html = readFileSync(resolve(repoRoot, "app/public/index.html"), "utf8");
    const match = html.match(/const GHL_CAPTACION_MAY_2026_APPOINTMENTS=(\{[\s\S]*?\n\});/);
    expect(match, "missing frontend GHL override block").toBeTruthy();

    const frontendRows = Function(`return (${match?.[1] ?? "{}"});`)() as Record<
      string,
      { scheduled: number; qualified?: number; showed: number; cancelled: number }
    >;

    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_may_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    for (const row of payload.tables.daily_closer) {
      const expectedQualified = row.agendas_calificadas ?? 0;
      const expectedScheduled = row.agendas_final ?? 0;
      const expectedCancelled = Math.max(0, expectedScheduled - expectedQualified);
      const expectedFrontendRow = {
        scheduled: expectedScheduled,
        showed: row.citas_asistidas ?? 0,
        cancelled: expectedCancelled,
        ...(expectedQualified > expectedScheduled ? { qualified: expectedQualified } : {}),
      };
      expect(frontendRows[row.date], `missing frontend row for ${row.date}`).toEqual(expectedFrontendRow);
    }
  });
});
