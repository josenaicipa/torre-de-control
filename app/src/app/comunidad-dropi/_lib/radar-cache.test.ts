import { beforeEach, describe, expect, it } from "vitest";
import {
  AVAILABLE_MONTHS_CACHE_KEY,
  clearRadarCache,
  comparativoCacheKey,
  formatMonthRef,
  memoRadar,
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

describe("comparativoCacheKey", () => {
  it("usa los keys de período y el fallback cuando están presentes", () => {
    expect(
      comparativoCacheKey({
        granularity: "weekly",
        currentKey: "w:2026-05-01_2026-05-07",
        comparisonKey: "w:2026-04-24_2026-04-30",
        fallbackMonthly: { year: 2026, month: 5 },
      }),
    ).toBe(
      "comparativo:weekly:w:2026-05-01_2026-05-07:w:2026-04-24_2026-04-30:2026-5",
    );
  });
  it("cae en defaults cuando faltan keys o fallback", () => {
    expect(comparativoCacheKey({ granularity: "monthly" })).toBe(
      "comparativo:monthly:default:default:none",
    );
    expect(
      comparativoCacheKey({
        granularity: "weekly",
        currentKey: null,
        comparisonKey: null,
        fallbackMonthly: null,
      }),
    ).toBe("comparativo:weekly:default:default:none");
  });
  it("la granularidad separa llaves con el mismo input", () => {
    expect(comparativoCacheKey({ granularity: "weekly" })).not.toBe(
      comparativoCacheKey({ granularity: "monthly" }),
    );
  });
  it("dos inputs equivalentes comparten llave", () => {
    const input = {
      granularity: "monthly" as const,
      currentKey: "m:2026-5",
      fallbackMonthly: { year: 2026, month: 5 },
    };
    expect(comparativoCacheKey(input)).toBe(comparativoCacheKey({ ...input }));
  });
});

describe("memoRadar / clearRadarCache", () => {
  beforeEach(() => {
    clearRadarCache();
  });

  it("reusa el resultado para la misma llave sin reconstruir", async () => {
    let calls = 0;
    const build = async () => {
      calls += 1;
      return calls;
    };
    const first = await memoRadar("k", build);
    const second = await memoRadar("k", build);
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(calls).toBe(1);
  });

  it("llaves distintas no comparten valor", async () => {
    const a = await memoRadar("a", async () => "A");
    const b = await memoRadar("b", async () => "B");
    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("clearRadarCache fuerza una reconstrucción", async () => {
    let calls = 0;
    const build = async () => {
      calls += 1;
      return calls;
    };
    await memoRadar("k", build);
    clearRadarCache();
    const after = await memoRadar("k", build);
    expect(after).toBe(2);
    expect(calls).toBe(2);
  });

  it("no cachea promesas rechazadas: la siguiente lectura reintenta", async () => {
    let calls = 0;
    await expect(
      memoRadar("k", async () => {
        calls += 1;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const recovered = await memoRadar("k", async () => {
      calls += 1;
      return "ok";
    });
    expect(recovered).toBe("ok");
    expect(calls).toBe(2);
  });
});
