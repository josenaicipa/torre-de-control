import { describe, expect, it } from "vitest";
import {
  compareForHelp,
  compareForLove,
  pickHelp,
  pickLove,
} from "./radar-lists";
import type { RadarMember, RadarSegment } from "@/lib/comunidad-dropi-radar";

function makeMember(overrides: {
  id: string;
  segment: RadarSegment;
  deliveredDelta?: number | null;
  deliveredDeltaPct?: number | null;
  current?: { ordersDelivered: number; ordersEntered?: number };
  previous?: { ordersDelivered: number } | null;
}): RadarMember {
  const current = {
    ordersDelivered: overrides.current?.ordersDelivered ?? 0,
    ordersEntered: overrides.current?.ordersEntered ?? 0,
    ordersMoved: 0,
    ordersReturned: 0,
  };
  return {
    id: overrides.id,
    fullName: overrides.id,
    email: null,
    phone: null,
    country: null,
    currentSegment: null,
    currentPriority: null,
    currentStatus: null,
    linkedStudentId: null,
    current,
    previous: overrides.previous
      ? {
          ordersDelivered: overrides.previous.ordersDelivered,
          ordersEntered: 0,
          ordersMoved: 0,
          ordersReturned: 0,
        }
      : null,
    deliveryRate: 0,
    deliveryRateOperational: 0,
    returnRate: 0,
    deliveredDelta: overrides.deliveredDelta ?? null,
    deliveredDeltaPct: overrides.deliveredDeltaPct ?? null,
    enteredDelta: null,
    enteredDeltaPct: null,
    starScore: 0,
    segment: overrides.segment,
    reason: "",
    suggestedAction: "",
  };
}

describe("compareForLove", () => {
  it("prefiere mayor delta absoluto positivo sobre mayor porcentaje", () => {
    const big = makeMember({
      id: "big",
      segment: "GROWING",
      deliveredDelta: 200,
      deliveredDeltaPct: 20,
    });
    const noisy = makeMember({
      id: "noisy",
      segment: "GROWING",
      deliveredDelta: 9,
      deliveredDeltaPct: 900,
    });
    const sorted = [noisy, big].sort(compareForLove);
    expect(sorted.map((m) => m.id)).toEqual(["big", "noisy"]);
  });

  it("usa el porcentaje como desempate cuando el delta empata", () => {
    const a = makeMember({
      id: "a",
      segment: "GROWING",
      deliveredDelta: 50,
      deliveredDeltaPct: 25,
    });
    const b = makeMember({
      id: "b",
      segment: "GROWING",
      deliveredDelta: 50,
      deliveredDeltaPct: 60,
    });
    const sorted = [a, b].sort(compareForLove);
    expect(sorted.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("trata miembros sin delta (NEW/RECOVERED) usando entregadas actuales", () => {
    const fresh = makeMember({
      id: "fresh",
      segment: "NEW",
      current: { ordersDelivered: 30 },
    });
    const growing = makeMember({
      id: "growing",
      segment: "GROWING",
      deliveredDelta: 10,
      deliveredDeltaPct: 50,
      current: { ordersDelivered: 30 },
    });
    const sorted = [growing, fresh].sort(compareForLove);
    expect(sorted.map((m) => m.id)).toEqual(["fresh", "growing"]);
  });
});

describe("compareForHelp", () => {
  it("prioriza la mayor pérdida absoluta sobre el porcentaje más feo", () => {
    const bigDrop = makeMember({
      id: "bigDrop",
      segment: "DROPPING",
      deliveredDelta: -200,
      deliveredDeltaPct: -40,
    });
    const noisyDrop = makeMember({
      id: "noisyDrop",
      segment: "DROPPING",
      deliveredDelta: -9,
      deliveredDeltaPct: -90,
    });
    const sorted = [noisyDrop, bigDrop].sort(compareForHelp);
    expect(sorted.map((m) => m.id)).toEqual(["bigDrop", "noisyDrop"]);
  });

  it("INACTIVE sin deliveredDelta usa -previous.ordersDelivered como pérdida absoluta", () => {
    // inactiveBig venía de 150 entregadas y cayó a 0 este mes; la pérdida
    // real es -150 aunque el caller no haya computado `deliveredDelta`.
    // Debe pesar más que un DROPPING de -50.
    const inactiveBig = makeMember({
      id: "inactiveBig",
      segment: "INACTIVE",
      current: { ordersDelivered: 0 },
      previous: { ordersDelivered: 150 },
    });
    const droppingSmall = makeMember({
      id: "droppingSmall",
      segment: "DROPPING",
      deliveredDelta: -50,
      deliveredDeltaPct: -50,
    });
    const sorted = [droppingSmall, inactiveBig].sort(compareForHelp);
    expect(sorted.map((m) => m.id)).toEqual(["inactiveBig", "droppingSmall"]);
  });

  it("INACTIVE sin previous ni deliveredDelta cae a -current como fallback seguro", () => {
    // Sin mes previo ni delta explícito no podemos cuantificar la pérdida,
    // pero el orden no debe romperse: -current (= 0 si current=0) deja al
    // miembro al final del bucket, no al principio.
    const inactiveNoHistory = makeMember({
      id: "inactiveNoHistory",
      segment: "INACTIVE",
      current: { ordersDelivered: 0 },
      previous: null,
    });
    const droppingSmall = makeMember({
      id: "droppingSmall",
      segment: "DROPPING",
      deliveredDelta: -50,
      deliveredDeltaPct: -50,
    });
    const sorted = [inactiveNoHistory, droppingSmall].sort(compareForHelp);
    expect(sorted.map((m) => m.id)).toEqual(["droppingSmall", "inactiveNoHistory"]);
  });

  it("usa el porcentaje como desempate cuando el delta absoluto empata", () => {
    const a = makeMember({
      id: "a",
      segment: "DROPPING",
      deliveredDelta: -50,
      deliveredDeltaPct: -20,
    });
    const b = makeMember({
      id: "b",
      segment: "DROPPING",
      deliveredDelta: -50,
      deliveredDeltaPct: -80,
    });
    const sorted = [a, b].sort(compareForHelp);
    expect(sorted.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("pickLove / pickHelp", () => {
  it("pickLove filtra a GROWING+RECOVERED+NEW", () => {
    const members = [
      makeMember({
        id: "g",
        segment: "GROWING",
        deliveredDelta: 10,
        deliveredDeltaPct: 10,
      }),
      makeMember({
        id: "r",
        segment: "RECOVERED",
        current: { ordersDelivered: 20 },
      }),
      makeMember({
        id: "n",
        segment: "NEW",
        current: { ordersDelivered: 5 },
      }),
      makeMember({
        id: "stable",
        segment: "STABLE",
        deliveredDelta: 0,
        deliveredDeltaPct: 0,
      }),
      makeMember({
        id: "star",
        segment: "STAR",
        deliveredDelta: 100,
        deliveredDeltaPct: 100,
      }),
    ];
    const picked = pickLove(members, 5);
    expect(picked.map((m) => m.id).sort()).toEqual(["g", "n", "r"]);
  });

  it("pickHelp filtra a DROPPING+INACTIVE y respeta el límite", () => {
    const members = [
      makeMember({
        id: "d1",
        segment: "DROPPING",
        deliveredDelta: -200,
        deliveredDeltaPct: -50,
      }),
      makeMember({
        id: "d2",
        segment: "DROPPING",
        deliveredDelta: -50,
        deliveredDeltaPct: -10,
      }),
      makeMember({
        id: "i",
        segment: "INACTIVE",
        current: { ordersDelivered: 0 },
      }),
      makeMember({
        id: "g",
        segment: "GROWING",
        deliveredDelta: 100,
        deliveredDeltaPct: 100,
      }),
    ];
    const picked = pickHelp(members, 2);
    expect(picked.map((m) => m.id)).toEqual(["d1", "d2"]);
  });
});
