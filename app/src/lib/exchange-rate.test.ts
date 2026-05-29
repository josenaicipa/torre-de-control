import { describe, it, expect } from "vitest";
import {
  buildTrmRequestUrl,
  ExchangeRateUnavailableError,
  getExchangeRate,
  isIsoDate,
  parseTrmRow,
  SOURCE_TRM_DATOS_GOV,
  SOURCE_USD_PAR,
} from "./exchange-rate";

describe("isIsoDate", () => {
  it("acepta YYYY-MM-DD válido", () => {
    expect(isIsoDate("2026-05-29")).toBe(true);
  });
  it("rechaza formato inválido", () => {
    expect(isIsoDate("29/05/2026")).toBe(false);
    expect(isIsoDate("2026-5-29")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("parseTrmRow", () => {
  it("parsea valor string + vigenciadesde ISO", () => {
    const row = {
      valor: "4123.45",
      vigenciadesde: "2026-05-28T00:00:00.000",
      vigenciahasta: "2026-05-28T00:00:00.000",
    };
    expect(parseTrmRow(row)).toEqual({
      rate: 4123.45,
      effectiveDate: "2026-05-28",
    });
  });

  it("acepta coma decimal", () => {
    const row = { valor: "4123,45", vigenciadesde: "2026-05-28T00:00:00.000" };
    expect(parseTrmRow(row)).toEqual({
      rate: 4123.45,
      effectiveDate: "2026-05-28",
    });
  });

  it("devuelve null para entrada inválida", () => {
    expect(parseTrmRow(null)).toBeNull();
    expect(parseTrmRow({ valor: "abc", vigenciadesde: "2026-05-28T00:00:00.000" })).toBeNull();
    expect(parseTrmRow({ valor: "4000", vigenciadesde: "abc" })).toBeNull();
    expect(parseTrmRow({ valor: "0", vigenciadesde: "2026-05-28T00:00:00.000" })).toBeNull();
  });
});

describe("buildTrmRequestUrl", () => {
  it("incluye filtro vigenciadesde <= fecha y orden DESC", () => {
    const url = buildTrmRequestUrl("2026-05-29");
    expect(url).toContain("32sa-8pi3.json");
    expect(url).toContain(encodeURIComponent("vigenciadesde<='2026-05-29T23:59:59.999'"));
    expect(url).toContain(encodeURIComponent("vigenciadesde DESC"));
    expect(url).toContain("%24limit=1");
  });
});

describe("getExchangeRate", () => {
  it("USD devuelve paridad 1 sin red", async () => {
    const fetchImpl = async () => {
      throw new Error("no debería llamarse");
    };
    const result = await getExchangeRate("usd", "2026-05-29", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.rate).toBe(1);
    expect(result.currency).toBe("USD");
    expect(result.source).toBe(SOURCE_USD_PAR);
    expect(result.effectiveDate).toBe("2026-05-29");
  });

  it("COP retorna TRM parseada del fetch mockeado", async () => {
    let lastUrl = "";
    const fetchImpl = (async (input: string | URL) => {
      lastUrl = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            valor: "4250.10",
            vigenciadesde: "2026-05-29T00:00:00.000",
            vigenciahasta: "2026-05-29T00:00:00.000",
          },
        ],
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const result = await getExchangeRate("COP", "2026-05-29", { fetchImpl });
    expect(result.rate).toBe(4250.1);
    expect(result.currency).toBe("COP");
    expect(result.effectiveDate).toBe("2026-05-29");
    expect(result.source).toBe(SOURCE_TRM_DATOS_GOV);
    expect(lastUrl).toContain("32sa-8pi3.json");
  });

  it("COP fines de semana: usa la TRM más reciente disponible", async () => {
    const fetchImpl = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            valor: "4100",
            vigenciadesde: "2026-05-29T00:00:00.000",
            vigenciahasta: "2026-05-31T00:00:00.000",
          },
        ],
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const result = await getExchangeRate("COP", "2026-05-31", { fetchImpl });
    expect(result.rate).toBe(4100);
    expect(result.effectiveDate).toBe("2026-05-29");
  });

  it("COP error 500 → ExchangeRateUnavailableError", async () => {
    const fetchImpl = (async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(
      getExchangeRate("COP", "2026-05-29", { fetchImpl }),
    ).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it("COP respuesta vacía → ExchangeRateUnavailableError", async () => {
    const fetchImpl = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await expect(
      getExchangeRate("COP", "2026-05-29", { fetchImpl }),
    ).rejects.toBeInstanceOf(ExchangeRateUnavailableError);
  });

  it("Moneda no soportada → ExchangeRateUnavailableError", async () => {
    await expect(getExchangeRate("MXN", "2026-05-29")).rejects.toBeInstanceOf(
      ExchangeRateUnavailableError,
    );
  });

  it("Fecha inválida → ExchangeRateUnavailableError", async () => {
    await expect(getExchangeRate("USD", "29-05-2026")).rejects.toBeInstanceOf(
      ExchangeRateUnavailableError,
    );
  });
});
