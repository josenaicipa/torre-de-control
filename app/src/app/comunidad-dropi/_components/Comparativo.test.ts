import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComparativoSection } from "./Comparativo";
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

function renderSection(comparativo: Comparativo, hideControls: boolean): string {
  return renderToStaticMarkup(
    createElement(ComparativoSection, {
      comparativo,
      formAction: "/comunidad-dropi/crecimiento",
      hideControls,
    }),
  );
}

describe("ComparativoSection — controles manuales", () => {
  it("por defecto muestra el selector manual 'Comparar con' y el helper", () => {
    const html = renderSection(makeComparativo(), false);
    expect(html).toContain("Comparar con");
    expect(html).toContain("Sin comparación");
    expect(html).toContain("Para comparar semanas");
  });

  it("con hideControls no renderiza 'Comparar con' ni 'Sin comparación' ni el helper", () => {
    const html = renderSection(makeComparativo(), true);
    expect(html).not.toContain("Comparar con");
    expect(html).not.toContain("Sin comparación");
    expect(html).not.toContain("Para comparar semanas");
  });

  it("con hideControls no muestra 'Sin comparación' aunque no haya período previo", () => {
    const html = renderSection(
      makeComparativo({ comparison: null }),
      true,
    );
    expect(html).not.toContain("Sin comparación");
  });
});

describe("Crecimiento — filtro único como en Radar", () => {
  // Reproduce lo que monta la página: RadarPeriodFiltro arriba +
  // ComparativoSection con los controles ocultos.
  function renderPantalla(comparativo: Comparativo): string {
    return (
      renderToStaticMarkup(
        createElement(RadarPeriodFiltro, {
          comparativo,
          formAction: "/comunidad-dropi/crecimiento",
        }),
      ) + renderSection(comparativo, true)
    );
  }

  it("expone un único filtro: Ver por + granularidad + período + Aplicar", () => {
    const html = renderPantalla(makeComparativo());
    expect(html).toContain("Ver por");
    expect(html).toContain('name="granularity"');
    expect(html).toContain('name="current"');
    expect(html).toContain("Aplicar");
  });

  it("explica que la comparación es automática contra el período anterior", () => {
    const html = renderPantalla(makeComparativo());
    expect(html).toContain("comparación es automática");
    expect(html).toContain("el mes anterior");
  });

  it("no ofrece comparación manual ni la opción 'Sin comparación'", () => {
    const html = renderPantalla(makeComparativo());
    expect(html).not.toContain("Comparar con");
    expect(html).not.toContain("Sin comparación");
  });
});
