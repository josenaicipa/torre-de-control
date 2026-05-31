import { describe, expect, it } from "vitest";
import {
  AVAILABLE_MONTHS_CACHE_KEY,
  formatMonthRef,
  radarCacheKey,
  WEEKLY_PULSE_CACHE_KEY,
} from "./radar-cache";

describe("formatMonthRef", () => {
  it("formatea mes en español", () => {
    expect(formatMonthRef({ year: 2026, month: 5 })).toBe("Mayo 2026");
    expect(formatMonthRef({ year: 2025, month: 12 })).toBe("Diciembre 2025");
  });
  it("clampa meses fuera de rango sin tirar", () => {
    expect(formatMonthRef({ year: 2026, month: 0 })).toBe("Enero 2026");
    expect(formatMonthRef({ year: 2026, month: 13 })).toBe("Diciembre 2026");
  });
});

describe("radarCacheKey", () => {
  it("usa year-month cuando ambos son finitos", () => {
    expect(radarCacheKey({ year: 2026, month: 5 })).toBe("radar:2026-5");
  });
  it("cae en `latest` cuando falta year o month", () => {
    expect(radarCacheKey({})).toBe("radar:latest-latest");
    expect(radarCacheKey({ year: 2026 })).toBe("radar:2026-latest");
    expect(radarCacheKey({ month: 5 })).toBe("radar:latest-5");
  });
  it("trata NaN/Infinity como `latest`", () => {
    expect(radarCacheKey({ year: Number.NaN, month: 5 })).toBe(
      "radar:latest-5",
    );
    expect(radarCacheKey({ year: 2026, month: Number.POSITIVE_INFINITY })).toBe(
      "radar:2026-latest",
    );
  });
  it("dos lecturas para el mismo periodo comparten llave", () => {
    expect(radarCacheKey({ year: 2026, month: 4 })).toBe(
      radarCacheKey({ year: 2026, month: 4 }),
    );
  });
  it("las llaves del weekly y de meses disponibles no chocan con la del radar", () => {
    expect(WEEKLY_PULSE_CACHE_KEY).toBe("weekly-pulse:latest");
    expect(AVAILABLE_MONTHS_CACHE_KEY).toBe("available-months");
    expect(WEEKLY_PULSE_CACHE_KEY).not.toContain("radar:");
    expect(AVAILABLE_MONTHS_CACHE_KEY).not.toContain("radar:");
  });
});
