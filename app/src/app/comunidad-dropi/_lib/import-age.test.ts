import { describe, expect, it } from "vitest";
import {
  STALE_IMPORT_THRESHOLD_DAYS,
  classifyImportAge,
  formatImportDate,
} from "./import-age";

const NOW = new Date("2026-05-31T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

describe("classifyImportAge", () => {
  it("marca como missing cuando no hay fecha", () => {
    const info = classifyImportAge(null, NOW);
    expect(info.status).toBe("missing");
    expect(info.daysSince).toBeNull();
    expect(info.formattedDate).toBeNull();
    expect(info.message).toMatch(/Sin importación/i);
  });

  it("marca como fresh dentro del umbral", () => {
    const info = classifyImportAge(daysAgo(3), NOW);
    expect(info.status).toBe("fresh");
    expect(info.daysSince).toBe(3);
    expect(info.message).toContain("hace 3 días");
  });

  it("usa singular cuando hace exactamente 1 día", () => {
    const info = classifyImportAge(daysAgo(1), NOW);
    expect(info.status).toBe("fresh");
    expect(info.message).toContain("hace 1 día");
    expect(info.message).not.toContain("1 días");
  });

  it("considera fresh el día exacto del umbral", () => {
    const info = classifyImportAge(daysAgo(STALE_IMPORT_THRESHOLD_DAYS), NOW);
    expect(info.status).toBe("fresh");
  });

  it("marca como stale cuando supera el umbral", () => {
    const info = classifyImportAge(
      daysAgo(STALE_IMPORT_THRESHOLD_DAYS + 1),
      NOW,
    );
    expect(info.status).toBe("stale");
    expect(info.daysSince).toBe(STALE_IMPORT_THRESHOLD_DAYS + 1);
    expect(info.message).toMatch(/desactualizado/i);
  });

  it("no retorna días negativos si la fecha está en el futuro", () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    const info = classifyImportAge(future, NOW);
    expect(info.daysSince).toBe(0);
    expect(info.status).toBe("fresh");
  });
});

describe("formatImportDate", () => {
  it("formatea como DD/MM/YYYY usando la zona horaria local", () => {
    const d = new Date(2026, 0, 5);
    expect(formatImportDate(d)).toBe("05/01/2026");
  });
});
