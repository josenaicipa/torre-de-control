import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");

type ImportPayload = {
  tables: {
    daily_closer: Array<{
      date: string;
      cal_otros?: number;
      agendas_calificadas?: number;
      agendas_final?: number;
      citas_asistidas?: number;
    }>;
  };
};

const MAY_2026_HOY_AND_CANCELLED: Record<string, { hoy: number; canceladas: number }> = {
  "2026-05-01": { hoy: 2, canceladas: 1 },
  "2026-05-02": { hoy: 17, canceladas: 10 },
  "2026-05-03": { hoy: 0, canceladas: 0 },
  "2026-05-04": { hoy: 44, canceladas: 27 },
  "2026-05-05": { hoy: 45, canceladas: 27 },
  "2026-05-06": { hoy: 34, canceladas: 18 },
  "2026-05-07": { hoy: 39, canceladas: 20 },
  "2026-05-08": { hoy: 32, canceladas: 21 },
  "2026-05-09": { hoy: 15, canceladas: 13 },
  "2026-05-10": { hoy: 0, canceladas: 0 },
  "2026-05-11": { hoy: 36, canceladas: 18 },
  "2026-05-12": { hoy: 27, canceladas: 9 },
  "2026-05-13": { hoy: 28, canceladas: 11 },
  "2026-05-14": { hoy: 22, canceladas: 9 },
  "2026-05-15": { hoy: 27, canceladas: 6 },
  "2026-05-16": { hoy: 10, canceladas: 4 },
  "2026-05-17": { hoy: 0, canceladas: 0 },
  "2026-05-18": { hoy: 21, canceladas: 10 },
  "2026-05-19": { hoy: 29, canceladas: 13 },
  "2026-05-20": { hoy: 34, canceladas: 17 },
  "2026-05-21": { hoy: 30, canceladas: 11 },
  "2026-05-22": { hoy: 20, canceladas: 6 },
  "2026-05-23": { hoy: 18, canceladas: 7 },
  "2026-05-24": { hoy: 0, canceladas: 0 },
  "2026-05-25": { hoy: 27, canceladas: 6 },
  "2026-05-26": { hoy: 34, canceladas: 15 },
  "2026-05-27": { hoy: 25, canceladas: 9 },
  "2026-05-28": { hoy: 34, canceladas: 15 },
  "2026-05-29": { hoy: 32, canceladas: 12 },
  "2026-05-30": { hoy: 16, canceladas: 11 },
  "2026-05-31": { hoy: 0, canceladas: 0 },
};

describe("May 2026 GHL Agendas / Leads import rule", () => {
  it("calculates Calificadas Total as Hoy (en agenda) minus cancelled appointments, not the lead_calificado tag", () => {
    const payload = JSON.parse(
      readFileSync(resolve(repoRoot, "imports/torre_import_daily_closer_may_2026_from_ghl.json"), "utf8"),
    ) as ImportPayload;

    for (const [date, source] of Object.entries(MAY_2026_HOY_AND_CANCELLED)) {
      const expectedCalificadas = Math.max(0, source.hoy - source.canceladas);
      const payloadRow = payload.tables.daily_closer.find((row) => row.date === date);

      expect(payloadRow, `missing import payload row for ${date}`).toBeDefined();
      expect(payloadRow?.agendas_final).toBe(source.hoy);
      expect(payloadRow?.agendas_calificadas).toBe(expectedCalificadas);
      expect(payloadRow?.cal_otros).toBe(expectedCalificadas);
    }

    const total = payload.tables.daily_closer.reduce((sum, row) => sum + (row.agendas_calificadas ?? 0), 0);
    expect(total).toBe(372);
  });
});
