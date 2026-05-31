import { describe, expect, it } from "vitest";
import {
  buildRadar,
  computeStarScore,
  rankRadarMembers,
  RADAR_RANKING_CRITERIA,
  type RadarMemberInput,
  type RadarRankingCriterion,
} from "./comunidad-dropi-radar";

// Helpers ---------------------------------------------------------------------

function makeMember(
  overrides: Partial<RadarMemberInput> & { id: string },
): RadarMemberInput {
  return {
    id: overrides.id,
    fullName: overrides.fullName ?? `Miembro ${overrides.id}`,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    country: overrides.country ?? "CO",
    currentSegment: overrides.currentSegment ?? null,
    currentPriority: overrides.currentPriority ?? null,
    currentStatus: overrides.currentStatus ?? "ACTIVE",
    linkedStudentId: overrides.linkedStudentId ?? null,
    current:
      overrides.current ?? {
        ordersEntered: 0,
        ordersMoved: 0,
        ordersDelivered: 0,
        ordersReturned: 0,
      },
    previous: overrides.previous ?? null,
  };
}

const CURRENT = { year: 2026, month: 5 } as const;
const PREVIOUS = { year: 2026, month: 4 } as const;

describe("buildRadar — KPIs globales mensuales", () => {
  it("usa entregadas como métrica reina y muestra ingresadas como secundaria", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 100,
          ordersMoved: 80,
          ordersDelivered: 60,
          ordersReturned: 5,
        },
        previous: {
          ordersEntered: 80,
          ordersMoved: 60,
          ordersDelivered: 40,
          ordersReturned: 4,
        },
      }),
      makeMember({
        id: "b",
        current: {
          ordersEntered: 50,
          ordersMoved: 40,
          ordersDelivered: 30,
          ordersReturned: 2,
        },
        previous: {
          ordersEntered: 60,
          ordersMoved: 50,
          ordersDelivered: 35,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });

    expect(radar.kpis.delivered.current).toBe(90);
    expect(radar.kpis.delivered.previous).toBe(75);
    expect(radar.kpis.delivered.deltaAbs).toBe(15);
    expect(radar.kpis.delivered.deltaPct).toBe(20);

    expect(radar.kpis.entered.current).toBe(150);
    expect(radar.kpis.entered.previous).toBe(140);

    // tasaEntrega = entregadas / ingresadas
    expect(radar.kpis.deliveryRate.current).toBe(60);
    // tasaDevolucion = devoluciones / ingresadas
    expect(radar.kpis.returnRate.current).toBeCloseTo(4.67, 1);
  });

  it("maneja mes anterior ausente sin inventar porcentaje", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: null,
      members: [
        makeMember({
          id: "a",
          current: {
            ordersEntered: 10,
            ordersMoved: 8,
            ordersDelivered: 6,
            ordersReturned: 1,
          },
        }),
      ],
    });
    expect(radar.kpis.delivered.previous).toBeNull();
    expect(radar.kpis.delivered.deltaAbs).toBeNull();
    expect(radar.kpis.delivered.deltaPct).toBeNull();
  });

  it("entrega 0 para tasas cuando ingresadas es cero (sin NaN)", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: null,
      members: [
        makeMember({
          id: "a",
          current: {
            ordersEntered: 0,
            ordersMoved: 0,
            ordersDelivered: 0,
            ordersReturned: 0,
          },
        }),
      ],
    });
    expect(radar.kpis.deliveryRate.current).toBe(0);
    expect(radar.kpis.returnRate.current).toBe(0);
  });

  it("cuenta miembros activos del mes (con cualquier actividad)", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: [
        makeMember({
          id: "a",
          current: {
            ordersEntered: 10,
            ordersMoved: 8,
            ordersDelivered: 6,
            ordersReturned: 0,
          },
        }),
        makeMember({
          id: "b",
          current: {
            ordersEntered: 0,
            ordersMoved: 0,
            ordersDelivered: 0,
            ordersReturned: 0,
          },
        }),
      ],
    });
    expect(radar.kpis.activeMembers.current).toBe(1);
    expect(radar.kpis.totalMembers).toBe(2);
  });
});

describe("computeStarScore", () => {
  it("estrella = mucho volumen entregado + crecimiento + baja devolución + buena tasa entrega", () => {
    const members = [
      makeMember({
        id: "star",
        current: {
          ordersEntered: 100,
          ordersMoved: 90,
          ordersDelivered: 80,
          ordersReturned: 2,
        },
        previous: {
          ordersEntered: 80,
          ordersMoved: 70,
          ordersDelivered: 50,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "mid",
        current: {
          ordersEntered: 50,
          ordersMoved: 40,
          ordersDelivered: 30,
          ordersReturned: 5,
        },
        previous: {
          ordersEntered: 60,
          ordersMoved: 50,
          ordersDelivered: 35,
          ordersReturned: 6,
        },
      }),
      makeMember({
        id: "low",
        current: {
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 5,
          ordersReturned: 0,
        },
        previous: {
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 5,
          ordersReturned: 0,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const star = radar.members.find((m) => m.id === "star")!;
    const low = radar.members.find((m) => m.id === "low")!;
    expect(star.starScore).toBeGreaterThan(low.starScore);
    expect(star.starScore).toBeGreaterThanOrEqual(70);
  });

  it("no marca como estrella a alguien con devolución alta aunque venda mucho", () => {
    const members = [
      makeMember({
        id: "highVol",
        current: {
          ordersEntered: 200,
          ordersMoved: 150,
          ordersDelivered: 120,
          ordersReturned: 80,
        },
        previous: {
          ordersEntered: 100,
          ordersMoved: 80,
          ordersDelivered: 70,
          ordersReturned: 40,
        },
      }),
      makeMember({
        id: "clean",
        current: {
          ordersEntered: 50,
          ordersMoved: 45,
          ordersDelivered: 40,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 30,
          ordersMoved: 28,
          ordersDelivered: 25,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const highVol = radar.members.find((m) => m.id === "highVol")!;
    expect(highVol.segment).not.toBe("STAR");
    expect(highVol.segment).toBe("HIGH_RETURN");
    expect(highVol.reason.toLowerCase()).toContain("devolución");
  });

  it("no marca como estrella a alguien sin volumen mínimo aunque crezca", () => {
    const members = [
      makeMember({
        id: "tinyGrowth",
        current: {
          ordersEntered: 2,
          ordersMoved: 2,
          ordersDelivered: 2,
          ordersReturned: 0,
        },
        previous: {
          ordersEntered: 1,
          ordersMoved: 1,
          ordersDelivered: 1,
          ordersReturned: 0,
        },
      }),
      makeMember({
        id: "bigBase",
        current: {
          ordersEntered: 200,
          ordersMoved: 180,
          ordersDelivered: 150,
          ordersReturned: 5,
        },
        previous: {
          ordersEntered: 180,
          ordersMoved: 160,
          ordersDelivered: 130,
          ordersReturned: 4,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const tiny = radar.members.find((m) => m.id === "tinyGrowth")!;
    expect(tiny.segment).not.toBe("STAR");
  });

  it("expone el score como número entre 0 y 100", () => {
    const score = computeStarScore({
      percentileDelivered: 100,
      percentileGrowth: 100,
      percentileLowReturn: 100,
      percentileDeliveryRate: 100,
    });
    expect(score).toBe(100);
    const zero = computeStarScore({
      percentileDelivered: 0,
      percentileGrowth: 0,
      percentileLowReturn: 0,
      percentileDeliveryRate: 0,
    });
    expect(zero).toBe(0);
  });
});

describe("segmentación automática (radar)", () => {
  it("RECOVERED cuando anterior=0 y actual>0", () => {
    const members = [
      makeMember({
        id: "rec",
        current: {
          ordersEntered: 12,
          ordersMoved: 10,
          ordersDelivered: 8,
          ordersReturned: 0,
        },
        previous: {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      }),
      makeMember({
        id: "other",
        current: {
          ordersEntered: 30,
          ordersMoved: 25,
          ordersDelivered: 20,
          ordersReturned: 2,
        },
        previous: {
          ordersEntered: 30,
          ordersMoved: 25,
          ordersDelivered: 20,
          ordersReturned: 2,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const rec = radar.members.find((m) => m.id === "rec")!;
    expect(rec.segment).toBe("RECOVERED");
    expect(rec.reason.toLowerCase()).toContain("recup");
  });

  it("INACTIVE cuando anterior>0 y actual=0", () => {
    const members = [
      makeMember({
        id: "off",
        current: {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
        previous: {
          ordersEntered: 20,
          ordersMoved: 15,
          ordersDelivered: 12,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const off = radar.members.find((m) => m.id === "off")!;
    expect(off.segment).toBe("INACTIVE");
    expect(off.reason.toLowerCase()).toContain("inactivo");
  });

  it("NEW cuando no hay mes anterior y hay actividad", () => {
    const members = [
      makeMember({
        id: "new",
        current: {
          ordersEntered: 12,
          ordersMoved: 10,
          ordersDelivered: 8,
          ordersReturned: 0,
        },
        previous: null,
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const newMember = radar.members.find((m) => m.id === "new")!;
    expect(newMember.segment).toBe("NEW");
  });

  it("GROWING / DROPPING / STABLE según delta entregadas vs mes anterior", () => {
    const members = [
      makeMember({
        id: "grow",
        current: {
          ordersEntered: 60,
          ordersMoved: 50,
          ordersDelivered: 40,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 40,
          ordersMoved: 30,
          ordersDelivered: 20,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "drop",
        current: {
          ordersEntered: 20,
          ordersMoved: 15,
          ordersDelivered: 10,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 50,
          ordersMoved: 40,
          ordersDelivered: 30,
          ordersReturned: 2,
        },
      }),
      makeMember({
        id: "stable",
        current: {
          ordersEntered: 30,
          ordersMoved: 25,
          ordersDelivered: 21,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 30,
          ordersMoved: 25,
          ordersDelivered: 20,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    expect(radar.members.find((m) => m.id === "grow")!.segment).toBe("GROWING");
    expect(radar.members.find((m) => m.id === "drop")!.segment).toBe("DROPPING");
    expect(radar.members.find((m) => m.id === "stable")!.segment).toBe("STABLE");
  });
});

describe("rankRadarMembers — multi criterio", () => {
  const baseMembers: RadarMemberInput[] = [
    makeMember({
      id: "a",
      fullName: "Ana",
      country: "CO",
      current: {
        ordersEntered: 100,
        ordersMoved: 90,
        ordersDelivered: 80,
        ordersReturned: 2,
      },
      previous: {
        ordersEntered: 50,
        ordersMoved: 40,
        ordersDelivered: 30,
        ordersReturned: 1,
      },
    }),
    makeMember({
      id: "b",
      fullName: "Bruno",
      country: "MX",
      current: {
        ordersEntered: 200,
        ordersMoved: 150,
        ordersDelivered: 90,
        ordersReturned: 60,
      },
      previous: {
        ordersEntered: 180,
        ordersMoved: 150,
        ordersDelivered: 100,
        ordersReturned: 50,
      },
    }),
    makeMember({
      id: "c",
      fullName: "Carla",
      country: "CO",
      current: {
        ordersEntered: 60,
        ordersMoved: 55,
        ordersDelivered: 50,
        ordersReturned: 1,
      },
      previous: {
        ordersEntered: 80,
        ordersMoved: 75,
        ordersDelivered: 70,
        ordersReturned: 2,
      },
    }),
  ];

  it("starScore es el ranking por defecto", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "STAR_SCORE");
    expect(ranked[0].starScore).toBeGreaterThanOrEqual(ranked[1].starScore);
    expect(ranked[1].starScore).toBeGreaterThanOrEqual(ranked[2].starScore);
  });

  it("DELIVERED ordena por entregadas desc", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "DELIVERED");
    expect(ranked[0].id).toBe("b");
    expect(ranked[1].id).toBe("a");
    expect(ranked[2].id).toBe("c");
  });

  it("GROWTH ordena por mayor crecimiento entregadas desc", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "GROWTH");
    expect(ranked[0].id).toBe("a");
  });

  it("DECLINE ordena por mayor caída (delta más negativo)", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "DECLINE");
    expect(ranked[0].id).toBe("c");
  });

  it("RETURNS ordena por más devoluciones desc", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "RETURNS");
    expect(ranked[0].id).toBe("b");
  });

  it("DELIVERY_RATE ordena por mejor tasa de entrega desc", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "DELIVERY_RATE");
    expect(ranked[0].deliveryRate).toBeGreaterThanOrEqual(
      ranked[1].deliveryRate,
    );
  });

  it("ENTERED ordena por más ingresadas desc", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: baseMembers,
    });
    const ranked = rankRadarMembers(radar.members, "ENTERED");
    expect(ranked[0].id).toBe("b");
  });

  it("expone el catálogo de criterios reordenables", () => {
    expect(RADAR_RANKING_CRITERIA).toContain("STAR_SCORE");
    expect(RADAR_RANKING_CRITERIA).toContain("DELIVERED");
    expect(RADAR_RANKING_CRITERIA).toContain("ENTERED");
    expect(RADAR_RANKING_CRITERIA).toContain("DELIVERY_RATE");
    expect(RADAR_RANKING_CRITERIA).toContain("RETURNS");
    expect(RADAR_RANKING_CRITERIA).toContain("GROWTH");
    expect(RADAR_RANKING_CRITERIA).toContain("DECLINE");
  });
});

describe("segmentos visuales — conteos y top miembros", () => {
  it("agrupa por segmento con conteo, share y top miembros por entregadas", () => {
    const members = [
      makeMember({
        id: "s1",
        current: {
          ordersEntered: 100,
          ordersMoved: 90,
          ordersDelivered: 80,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 60,
          ordersMoved: 55,
          ordersDelivered: 45,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "s2",
        current: {
          ordersEntered: 120,
          ordersMoved: 110,
          ordersDelivered: 95,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 70,
          ordersMoved: 60,
          ordersDelivered: 50,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "d1",
        current: {
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 5,
          ordersReturned: 0,
        },
        previous: {
          ordersEntered: 40,
          ordersMoved: 35,
          ordersDelivered: 30,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const growing = radar.segmentBuckets.find((b) => b.segment === "GROWING");
    expect(growing).toBeTruthy();
    const dropping = radar.segmentBuckets.find((b) => b.segment === "DROPPING");
    expect(dropping?.memberCount).toBeGreaterThanOrEqual(1);
    const allBuckets: RadarRankingCriterion[] | undefined = undefined;
    expect(allBuckets).toBeUndefined();
    expect(
      radar.segmentBuckets.every((b) => Array.isArray(b.topMembers)),
    ).toBe(true);
  });
});

describe("buildRadar — uses ingresadas/devoluciones safely", () => {
  it("tasaEntrega y tasaDevolucion son 0 cuando ingresadas=0", () => {
    const members = [
      makeMember({
        id: "z",
        current: {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      }),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: null,
      members,
    });
    const z = radar.members.find((m) => m.id === "z")!;
    expect(z.deliveryRate).toBe(0);
    expect(z.returnRate).toBe(0);
  });
});
