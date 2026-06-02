import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RendimientoComunidad } from "./RendimientoComunidad";
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
    createElement(RendimientoComunidad, {
      comparativo,
      formAction: "/comunidad-dropi/radar",
      extraHiddenInputs: [{ name: "period", value: "2026-5" }],
    }),
  );
}

describe("RendimientoComunidad — filtros", () => {
  it("no ofrece un selector 'Comparar con' ni la opción 'Sin comparación'", () => {
    const html = render(makeComparativo());
    expect(html).not.toContain("Comparar con");
    expect(html).not.toContain("Sin comparación");
  });

  it("conserva el selector 'Ver por', el período actual y el botón Aplicar", () => {
    const html = render(makeComparativo());
    expect(html).toContain("Ver por");
    expect(html).toContain('name="granularity"');
    expect(html).toContain('name="current"');
    expect(html).toContain("Aplicar");
  });

  it("preserva los inputs ocultos del host (p. ej. ?period=)", () => {
    const html = render(makeComparativo());
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="period"');
    expect(html).toContain('value="2026-5"');
  });

  it("explica que la comparación es automática contra el período anterior", () => {
    const html = render(makeComparativo());
    expect(html).toContain("comparación es automática");
    expect(html).toContain("el mes anterior");
    expect(html).toContain("vs. mes anterior (Abril 2026)");
  });

  it("indica cuando no hay período anterior para comparar", () => {
    const html = render(makeComparativo({ comparison: null }));
    expect(html).toContain("Sin mes anterior para comparar");
    expect(html).not.toContain("Sin comparación");
  });
});
