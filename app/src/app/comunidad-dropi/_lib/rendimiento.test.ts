import { describe, expect, it } from "vitest";
import {
  buildAllMemberRows,
  decliningRows,
  risingRows,
  topDeliveredRows,
  type MemberMeta,
  type MemberPeriodRow,
  type MetricRow,
} from "./rendimiento";

function metric(overrides: Partial<MetricRow> & { memberId: string }): MetricRow {
  return {
    ordersEntered: 0,
    ordersMoved: 0,
    ordersDelivered: 0,
    ordersReturned: 0,
    ...overrides,
  };
}

function meta(
  entries: Record<string, MemberMeta>,
): Map<string, MemberMeta> {
  return new Map(Object.entries(entries));
}

describe("buildAllMemberRows", () => {
  it("incluye miembros que solo aparecen en la comparación con current=0 y delta negativo", () => {
    const current = [metric({ memberId: "a", ordersDelivered: 50 })];
    const comparison = [
      metric({ memberId: "a", ordersDelivered: 30 }),
      metric({ memberId: "b", ordersDelivered: 40 }),
    ];

    const rows = buildAllMemberRows(
      current,
      comparison,
      meta({
        a: { fullName: "A", country: "CO" },
        b: { fullName: "B", country: "MX" },
      }),
    );

    const b = rows.find((r) => r.id === "b");
    expect(b).toBeDefined();
    expect(b?.current.ordersDelivered).toBe(0);
    expect(b?.comparison?.ordersDelivered).toBe(40);
    expect(b?.deliveredDelta).toBe(-40);
    expect(b?.deliveredDeltaPct).toBe(-100);
  });

  it("agrega múltiples filas del mismo miembro y completa metadata", () => {
    const current = [
      metric({ memberId: "a", ordersDelivered: 10, ordersEntered: 5 }),
      metric({ memberId: "a", ordersDelivered: 15, ordersEntered: 3 }),
    ];

    const rows = buildAllMemberRows(
      current,
      [],
      meta({ a: { fullName: "Ana", country: "CO" } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].current.ordersDelivered).toBe(25);
    expect(rows[0].current.ordersEntered).toBe(8);
    expect(rows[0].fullName).toBe("Ana");
    expect(rows[0].comparison).toBeNull();
    expect(rows[0].deliveredDelta).toBeNull();
  });
});

describe("topDeliveredRows", () => {
  it("ordena descendente por entregadas y limita", () => {
    const rows = buildAllMemberRows(
      [
        metric({ memberId: "a", ordersDelivered: 10 }),
        metric({ memberId: "b", ordersDelivered: 30 }),
        metric({ memberId: "c", ordersDelivered: 20 }),
        metric({ memberId: "d", ordersDelivered: 0 }),
      ],
      [],
      meta({}),
    );

    const top = topDeliveredRows(rows, 2);
    expect(top.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("excluye miembros sin entregas", () => {
    const rows = buildAllMemberRows(
      [metric({ memberId: "z", ordersDelivered: 0 })],
      [],
      meta({}),
    );
    expect(topDeliveredRows(rows)).toHaveLength(0);
  });
});

describe("decliningRows", () => {
  it("ordena por pérdida absoluta mayor primero", () => {
    const rows = buildAllMemberRows(
      [
        metric({ memberId: "a", ordersDelivered: 90 }),
        metric({ memberId: "b", ordersDelivered: 0 }),
        metric({ memberId: "c", ordersDelivered: 95 }),
      ],
      [
        metric({ memberId: "a", ordersDelivered: 100 }),
        metric({ memberId: "b", ordersDelivered: 50 }),
        metric({ memberId: "c", ordersDelivered: 100 }),
      ],
      meta({}),
    );

    const declining = decliningRows(rows);
    // b: -50, a: -10, c: -5
    expect(declining.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("excluye crecimientos y miembros sin comparación", () => {
    const rows = buildAllMemberRows(
      [
        metric({ memberId: "up", ordersDelivered: 20 }),
        metric({ memberId: "new", ordersDelivered: 5 }),
      ],
      [metric({ memberId: "up", ordersDelivered: 10 })],
      meta({}),
    );
    expect(decliningRows(rows)).toHaveLength(0);
  });
});

describe("risingRows", () => {
  it("ordena por crecimiento absoluto mayor primero", () => {
    const rows = buildAllMemberRows(
      [
        metric({ memberId: "a", ordersDelivered: 110 }),
        metric({ memberId: "b", ordersDelivered: 60 }),
        metric({ memberId: "c", ordersDelivered: 105 }),
      ],
      [
        metric({ memberId: "a", ordersDelivered: 100 }),
        metric({ memberId: "b", ordersDelivered: 10 }),
        metric({ memberId: "c", ordersDelivered: 100 }),
      ],
      meta({}),
    );

    const rising = risingRows(rows);
    // b: +50, a: +10, c: +5
    expect(rising.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});
