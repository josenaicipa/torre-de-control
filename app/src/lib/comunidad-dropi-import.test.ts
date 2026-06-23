import { describe, expect, it } from "vitest";
import {
  aggregateRowsByMember,
  previewCsv,
  type ParsedRow,
} from "./comunidad-dropi-import";

function makeRow(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowNumber: 1,
    fullName: null,
    email: null,
    phone: null,
    country: null,
    dropiExternalId: null,
    ordersEntered: 0,
    ordersMoved: 0,
    ordersDelivered: 0,
    ordersReturned: 0,
    movementRate: 0,
    deliveryRate: 0,
    returnRate: 0,
    raw: {},
    ...overrides,
  };
}

describe("previewCsv country defaulting", () => {
  it("defaults to CO when the file has no country column", () => {
    const csv = [
      "nombre,correo,telefono,ordenes ingresadas",
      "Ana López,ana@example.com,+573001234567,10",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.rowsValid).toBe(1);
    expect(result.parsedRows[0].country).toBe("CO");
    expect(result.detectedColumns.country).toBeUndefined();
  });

  it("defaults to CO when the country cell is blank", () => {
    const csv = [
      "nombre,correo,pais,ordenes ingresadas",
      "Ana López,ana@example.com,,10",
      "Bruno Pérez,bruno@example.com,   ,5",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.rowsValid).toBe(2);
    expect(result.parsedRows[0].country).toBe("CO");
    expect(result.parsedRows[1].country).toBe("CO");
  });

  it("respects an explicit country value from the file", () => {
    const csv = [
      "nombre,correo,pais,ordenes ingresadas",
      "Ana López,ana@example.com,MX,10",
      "Bruno Pérez,bruno@example.com,Perú,5",
    ].join("\n");
    const result = previewCsv(csv);
    expect(result.parsedRows[0].country).toBe("MX");
    expect(result.parsedRows[1].country).toBe("PE");
  });
});

describe("aggregateRowsByMember", () => {
  it("sums order counts when several rows resolve to the same member", () => {
    // Same person appears twice (e.g. two identities collapsed onto one
    // existing member). The period metric must keep the SUM, not the last row.
    const entries = [
      {
        memberId: "m1",
        row: makeRow({
          rowNumber: 2,
          ordersEntered: 30,
          ordersMoved: 25,
          ordersDelivered: 20,
          ordersReturned: 5,
          country: "CO",
          raw: { NOMBRE: "Ana A" },
        }),
      },
      {
        memberId: "m1",
        row: makeRow({
          rowNumber: 3,
          ordersEntered: 70,
          ordersMoved: 58,
          ordersDelivered: 44,
          ordersReturned: 13,
          country: "CO",
          raw: { NOMBRE: "Ana B" },
        }),
      },
    ];

    const result = aggregateRowsByMember(entries);
    expect(result.size).toBe(1);
    const agg = result.get("m1")!;
    expect(agg.ordersEntered).toBe(100);
    expect(agg.ordersMoved).toBe(83);
    expect(agg.ordersDelivered).toBe(64);
    expect(agg.ordersReturned).toBe(18);
    expect(agg.rowCount).toBe(2);
    expect(agg.rowNumbers).toEqual([2, 3]);
  });

  it("preserves the file grand total across members instead of overwriting", () => {
    // Two file rows for member A plus one for member B. The summed totals must
    // match the file's grand total exactly.
    const entries = [
      { memberId: "a", row: makeRow({ ordersEntered: 40, ordersDelivered: 30, ordersReturned: 8 }) },
      { memberId: "a", row: makeRow({ ordersEntered: 35, ordersDelivered: 22, ordersReturned: 7 }) },
      { memberId: "b", row: makeRow({ ordersEntered: 25, ordersDelivered: 12, ordersReturned: 3 }) },
    ];

    const result = aggregateRowsByMember(entries);
    let totalEntered = 0;
    let totalDelivered = 0;
    let totalReturned = 0;
    for (const agg of result.values()) {
      totalEntered += agg.ordersEntered;
      totalDelivered += agg.ordersDelivered;
      totalReturned += agg.ordersReturned;
    }
    expect(totalEntered).toBe(100);
    expect(totalDelivered).toBe(64);
    expect(totalReturned).toBe(18);
    expect(result.get("a")!.ordersEntered).toBe(75);
    expect(result.get("b")!.ordersEntered).toBe(25);
  });

  it("recomputes rates from the summed counts, not from a single row", () => {
    const entries = [
      { memberId: "m", row: makeRow({ ordersEntered: 50, ordersMoved: 50, ordersDelivered: 25, ordersReturned: 25 }) },
      { memberId: "m", row: makeRow({ ordersEntered: 50, ordersMoved: 50, ordersDelivered: 25, ordersReturned: 25 }) },
    ];
    const agg = aggregateRowsByMember(entries).get("m")!;
    expect(agg.ordersMoved).toBe(100);
    expect(agg.deliveryRate).toBe(50);
    expect(agg.returnRate).toBe(50);
    expect(agg.movementRate).toBe(100);
  });

  it("keeps a single raw object for un-aggregated members and a list when aggregated", () => {
    const single = aggregateRowsByMember([
      { memberId: "one", row: makeRow({ raw: { NOMBRE: "Solo" } }) },
    ]).get("one")!;
    expect(single.raw).toEqual({ NOMBRE: "Solo" });
    expect(single.rowCount).toBe(1);

    const many = aggregateRowsByMember([
      { memberId: "two", row: makeRow({ raw: { NOMBRE: "Uno" } }) },
      { memberId: "two", row: makeRow({ raw: { NOMBRE: "Dos" } }) },
    ]).get("two")!;
    expect(many.raw).toEqual({
      aggregatedFrom: 2,
      rows: [{ NOMBRE: "Uno" }, { NOMBRE: "Dos" }],
    });
  });

  it("takes the first non-null country across aggregated rows", () => {
    const agg = aggregateRowsByMember([
      { memberId: "m", row: makeRow({ country: null }) },
      { memberId: "m", row: makeRow({ country: "MX" }) },
      { memberId: "m", row: makeRow({ country: "CO" }) },
    ]).get("m")!;
    expect(agg.country).toBe("MX");
  });
});
