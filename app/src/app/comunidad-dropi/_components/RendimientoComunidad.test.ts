import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RendimientoComunidad } from "./RendimientoComunidad";
import type { Comparativo } from "../_lib/crecimiento-data";
import type { MemberPeriodRow } from "../_lib/rendimiento";

function makeMemberRows(): MemberPeriodRow[] {
  return [
    {
      id: "a",
      fullName: "Ana",
      country: "Colombia",
      current: {
        ordersEntered: 50,
        ordersMoved: 0,
        ordersDelivered: 30,
        ordersReturned: 2,
      },
      comparison: {
        ordersEntered: 40,
        ordersMoved: 0,
        ordersDelivered: 40,
        ordersReturned: 1,
      },
      deliveredDelta: -10,
      deliveredDeltaPct: -25,
    },
    {
      id: "b",
      fullName: "Beto",
      country: "México",
      current: {
        ordersEntered: 80,
        ordersMoved: 0,
        ordersDelivered: 60,
        ordersReturned: 3,
      },
      comparison: {
        ordersEntered: 30,
        ordersMoved: 0,
        ordersDelivered: 20,
        ordersReturned: 0,
      },
      deliveredDelta: 40,
      deliveredDeltaPct: 200,
    },
  ];
}

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
    createElement(RendimientoComunidad, { comparativo }),
  );
}

describe("RendimientoComunidad — sin filtro propio", () => {
  it("no ofrece un selector 'Comparar con' ni la opción 'Sin comparación'", () => {
    const html = render(makeComparativo());
    expect(html).not.toContain("Comparar con");
    expect(html).not.toContain("Sin comparación");
  });

  it("ya no renderiza el filtro: sin 'Ver por', granularity/current ni 'Aplicar'", () => {
    const html = render(makeComparativo());
    expect(html).not.toContain("Ver por");
    expect(html).not.toContain('name="granularity"');
    expect(html).not.toContain('name="current"');
    expect(html).not.toContain("Aplicar");
    expect(html).not.toContain('type="hidden"');
  });

  it("muestra la comparación automática en el resumen del período", () => {
    const html = render(makeComparativo());
    expect(html).toContain("vs. mes anterior (Abril 2026)");
  });

  it("indica cuando no hay período anterior para comparar", () => {
    const html = render(makeComparativo({ comparison: null }));
    expect(html).toContain("Sin mes anterior para comparar");
    expect(html).not.toContain("Sin comparación");
  });
});

describe("RendimientoComunidad — encabezados ordenables", () => {
  it("hace clicables las columnas numéricas con aria-sort por defecto en 'none'", () => {
    const html = render(makeComparativo({ memberRows: makeMemberRows() }));
    // Cada columna ordenable es un <button> con su etiqueta en español.
    for (const label of [
      "Entregadas",
      "Ingresadas",
      "Actual",
      "Previo",
      "Pérdida",
      "% caída",
      "Aumento",
      "% aumento",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain("Ordenar por Entregadas");
    expect(html).toContain("Ordenar por Ingresadas");
  });

  it("no marca como ordenables las columnas '#' y 'Miembro'", () => {
    const html = render(makeComparativo({ memberRows: makeMemberRows() }));
    expect(html).not.toContain("Ordenar por Miembro");
    expect(html).not.toContain("Ordenar por #");
  });
});
