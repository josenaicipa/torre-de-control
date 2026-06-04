import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarPeriodFiltro } from "./RadarPeriodFiltro";
import type { Comparativo } from "../_lib/crecimiento-data";

function makeComparativo(overrides?: Partial<Comparativo>): Comparativo {
  const current = {
    granularity: "monthly" as const,
    key: "m:2026-5",
    label: "Mayo 2026",
    year: 2026,
    month: 5,
  };
  const comparison = {
    granularity: "monthly" as const,
    key: "m:2026-4",
    label: "Abril 2026",
    year: 2026,
    month: 4,
  };
  return {
    granularity: "monthly",
    requestedGranularity: "monthly",
    weeklyAvailable: true,
    current,
    comparison,
    kpis: {
      delivered: { current: 120, comparison: 100, deltaAbs: 20, deltaPct: 20 },
      entered: { current: 200, comparison: 180, deltaAbs: 20, deltaPct: 11.11 },
      returned: { current: 10, comparison: 12, deltaAbs: -2, deltaPct: -16.67 },
      deliveryRate: { current: 60, comparison: 55, deltaPts: 5 },
      deliveryRateOperational: { current: 70, comparison: 65, deltaPts: 5 },
    },
    currentSeries: [],
    comparisonSeries: [],
    topEntered: [],
    topDelivered: [],
    memberRows: [],
    available: [current, comparison],
    ...overrides,
  };
}

function render(comparativo: Comparativo): string {
  return renderToStaticMarkup(
    createElement(RadarPeriodFiltro, {
      comparativo,
      formAction: "/comunidad-dropi/radar",
    }),
  );
}

describe("RadarPeriodFiltro — filtro único superior", () => {
  it("contiene el selector 'Ver por' (granularidad), el período y el botón Aplicar", () => {
    const html = render(makeComparativo());
    expect(html).toContain("Ver por");
    expect(html).toContain('name="granularity"');
    expect(html).toContain('name="current"');
    expect(html).toContain("Aplicar");
  });

  it("explica que la comparación es automática contra el período anterior", () => {
    const html = render(makeComparativo());
    expect(html).toContain("comparación es automática");
    expect(html).toContain("el mes anterior");
  });

  it("usa 'la semana anterior' cuando la granularidad es semanal", () => {
    const html = render(makeComparativo({ granularity: "weekly" }));
    expect(html).toContain("la semana anterior");
  });

  it("no ofrece un selector 'Comparar con' ni 'Sin comparación'", () => {
    const html = render(makeComparativo());
    expect(html).not.toContain("Comparar con");
    expect(html).not.toContain("Sin comparación");
  });
});
