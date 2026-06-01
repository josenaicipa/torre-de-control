import { describe, expect, it } from "vitest";
import {
  buildDeclineCohort,
  buildGrowthCohorts,
  buildRadar,
  buildTopDelivered,
  computeStarScore,
  DROPI_RADAR_THRESHOLDS,
  rankRadarMembers,
  RADAR_RANKING_CRITERIA,
  RADAR_SUGGESTED_ACTIONS,
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

describe("buildRadar — Pulso global (semáforo de comunidad)", () => {
  it("GROWING cuando suben entregadas e ingresadas por encima del umbral", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 150,
          ordersMoved: 130,
          ordersDelivered: 100,
          ordersReturned: 2,
        },
        previous: {
          ordersEntered: 100,
          ordersMoved: 85,
          ordersDelivered: 60,
          ordersReturned: 1,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    expect(radar.pulse.state).toBe("GROWING");
    expect(radar.pulse.label).toBe("Creciendo");
    expect(radar.pulse.headline.toLowerCase()).toContain("creciendo");
  });

  it("ALERT cuando ingresadas suben pero entregadas bajan (no acompañan)", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 200,
          ordersMoved: 150,
          ordersDelivered: 55,
          ordersReturned: 3,
        },
        previous: {
          ordersEntered: 100,
          ordersMoved: 80,
          ordersDelivered: 60,
          ordersReturned: 2,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    expect(radar.pulse.state).toBe("ALERT");
    expect(radar.pulse.label).toBe("En alerta");
    expect(radar.pulse.headline.toLowerCase()).toContain("alerta");
  });

  it("DECLINING cuando bajan entregadas e ingresadas", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 60,
          ordersMoved: 45,
          ordersDelivered: 30,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 120,
          ordersMoved: 100,
          ordersDelivered: 80,
          ordersReturned: 2,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    expect(radar.pulse.state).toBe("DECLINING");
    expect(radar.pulse.label).toBe("A la baja");
    expect(radar.pulse.headline.toLowerCase()).toContain("baja");
  });

  it("STABLE cuando no hay mes previo para comparar", () => {
    const radar = buildRadar({
      current: CURRENT,
      previous: null,
      members: [
        makeMember({
          id: "a",
          current: {
            ordersEntered: 50,
            ordersMoved: 40,
            ordersDelivered: 30,
            ordersReturned: 1,
          },
        }),
      ],
    });
    expect(radar.pulse.state).toBe("STABLE");
  });
});

describe("buildRadar — tasa de entrega operativa vs. conversión", () => {
  it("deliveryRateOperational = entregadas/movidas y deliveryRate = entregadas/ingresadas", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 100,
          ordersMoved: 80,
          ordersDelivered: 60,
          ordersReturned: 2,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: null, members });
    const m = radar.members[0];
    expect(m.deliveryRate).toBe(60);
    expect(m.deliveryRateOperational).toBe(75);
    expect(radar.kpis.deliveryRate.current).toBe(60);
    expect(radar.kpis.deliveryRateOperational.current).toBe(75);
  });

  it("agrega deliveryRateOperational al nivel comunidad sumando entregadas y movidas", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 100,
          ordersMoved: 80,
          ordersDelivered: 60,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "b",
        current: {
          ordersEntered: 50,
          ordersMoved: 40,
          ordersDelivered: 20,
          ordersReturned: 0,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: null, members });
    // entregadas=80, movidas=120 → 66.67% operativa
    expect(radar.kpis.deliveryRateOperational.current).toBeCloseTo(66.67, 1);
    // entregadas=80, ingresadas=150 → 53.33% conversión
    expect(radar.kpis.deliveryRate.current).toBeCloseTo(53.33, 1);
  });

  it("deliveryRateOperational es 0 cuando movidas=0 (sin NaN ni Infinity)", () => {
    const members = [
      makeMember({
        id: "a",
        current: {
          ordersEntered: 20,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: null, members });
    expect(radar.members[0].deliveryRateOperational).toBe(0);
    expect(radar.kpis.deliveryRateOperational.current).toBe(0);
  });
});

describe("buildRadar — bloque de calidad de datos", () => {
  it("membersWithoutHistory cuenta miembros sin mes previo, no los mezcla con bajo rendimiento", () => {
    const members = [
      makeMember({
        id: "new-and-strong",
        linkedStudentId: "s1",
        current: {
          ordersEntered: 80,
          ordersMoved: 70,
          ordersDelivered: 50,
          ordersReturned: 1,
        },
        previous: null,
      }),
      makeMember({
        id: "dropping",
        linkedStudentId: "s2",
        current: {
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 5,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 60,
          ordersMoved: 50,
          ordersDelivered: 40,
          ordersReturned: 2,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    expect(radar.quality.totalMembers).toBe(2);
    expect(radar.quality.membersWithoutHistory).toBe(1);

    // "Sin historial" no se mezcla con bajo rendimiento: el miembro nuevo
    // queda en NEW (no DROPPING) y el dropping aparece en su propio segmento.
    const newMember = radar.members.find((m) => m.id === "new-and-strong")!;
    expect(newMember.segment).toBe("NEW");
    const dropping = radar.members.find((m) => m.id === "dropping")!;
    expect(dropping.segment).toBe("DROPPING");
  });

  it("membersWithoutLinkedStudent cuenta miembros sin cruce GHL, no los mezcla con bajo rendimiento", () => {
    const members = [
      makeMember({
        id: "linked-strong",
        linkedStudentId: "s1",
        current: {
          ordersEntered: 80,
          ordersMoved: 70,
          ordersDelivered: 50,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 40,
          ordersMoved: 35,
          ordersDelivered: 25,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "no-linked-strong",
        linkedStudentId: null,
        current: {
          ordersEntered: 100,
          ordersMoved: 90,
          ordersDelivered: 70,
          ordersReturned: 1,
        },
        previous: {
          ordersEntered: 50,
          ordersMoved: 45,
          ordersDelivered: 35,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "no-linked-dropping",
        linkedStudentId: null,
        current: {
          ordersEntered: 5,
          ordersMoved: 4,
          ordersDelivered: 3,
          ordersReturned: 0,
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
    expect(radar.quality.totalMembers).toBe(3);
    expect(radar.quality.membersWithoutLinkedStudent).toBe(2);

    // "Sin cruce GHL ↔ Dropi" no implica bajo rendimiento: uno de los sin
    // cruce es de hecho fuerte (GROWING/STAR), separado del que sí decrece.
    const strong = radar.members.find((m) => m.id === "no-linked-strong")!;
    expect(strong.segment).not.toBe("DROPPING");
    expect(strong.segment).not.toBe("HIGH_RETURN");
  });

  it("membersInactiveThisMonth solo cuenta miembros sin actividad este mes", () => {
    const members = [
      makeMember({
        id: "active",
        current: {
          ordersEntered: 10,
          ordersMoved: 8,
          ordersDelivered: 5,
          ordersReturned: 0,
        },
      }),
      makeMember({
        id: "idle",
        current: {
          ordersEntered: 0,
          ordersMoved: 0,
          ordersDelivered: 0,
          ordersReturned: 0,
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
    expect(radar.quality.membersInactiveThisMonth).toBe(1);
  });
});

describe("buildRadar — suggestedAction por segmento", () => {
  it("expone la acción humana sugerida para GROWING/DROPPING/STAR/HIGH_RETURN", () => {
    const members = [
      makeMember({
        id: "star",
        current: {
          ordersEntered: 200,
          ordersMoved: 180,
          ordersDelivered: 150,
          ordersReturned: 2,
        },
        previous: {
          ordersEntered: 100,
          ordersMoved: 90,
          ordersDelivered: 70,
          ordersReturned: 1,
        },
      }),
      makeMember({
        id: "growing",
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
        id: "dropping",
        current: {
          ordersEntered: 15,
          ordersMoved: 12,
          ordersDelivered: 8,
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
        id: "highReturn",
        current: {
          ordersEntered: 120,
          ordersMoved: 100,
          ordersDelivered: 80,
          ordersReturned: 40,
        },
        previous: {
          ordersEntered: 80,
          ordersMoved: 70,
          ordersDelivered: 60,
          ordersReturned: 20,
        },
      }),
    ];
    const radar = buildRadar({ current: CURRENT, previous: PREVIOUS, members });
    const star = radar.members.find((m) => m.id === "star")!;
    const growing = radar.members.find((m) => m.id === "growing")!;
    const dropping = radar.members.find((m) => m.id === "dropping")!;
    const highReturn = radar.members.find((m) => m.id === "highReturn")!;

    expect(star.segment).toBe("STAR");
    expect(star.suggestedAction).toBe(RADAR_SUGGESTED_ACTIONS.STAR);
    expect(growing.segment).toBe("GROWING");
    expect(growing.suggestedAction).toBe(RADAR_SUGGESTED_ACTIONS.GROWING);
    expect(dropping.segment).toBe("DROPPING");
    expect(dropping.suggestedAction).toBe(RADAR_SUGGESTED_ACTIONS.DROPPING);
    expect(highReturn.segment).toBe("HIGH_RETURN");
    expect(highReturn.suggestedAction).toBe(
      RADAR_SUGGESTED_ACTIONS.HIGH_RETURN,
    );
  });
});

describe("DROPI_RADAR_THRESHOLDS — config central del motor mensual", () => {
  it("expone bandas de crecimiento 10/20/30 y umbral de cohorte 50", () => {
    expect(DROPI_RADAR_THRESHOLDS.deliveredCohortMin).toBe(50);
    expect(DROPI_RADAR_THRESHOLDS.growthBandsPct).toEqual([10, 20, 30]);
    expect(DROPI_RADAR_THRESHOLDS.topDeliveredLimit).toBe(20);
  });
});

// Cohortes de Crecimiento — eje entregadas. Test exhaustivo de exclusión por
// volumen y de la asignación a la banda mayor cumplida.
function deliveredMember(
  id: string,
  currentDelivered: number,
  previousDelivered: number | null,
): RadarMemberInput {
  return makeMember({
    id,
    current: {
      ordersEntered: Math.max(currentDelivered, 0),
      ordersMoved: Math.max(currentDelivered, 0),
      ordersDelivered: currentDelivered,
      ordersReturned: 0,
    },
    previous:
      previousDelivered == null
        ? null
        : {
            ordersEntered: Math.max(previousDelivered, 0),
            ordersMoved: Math.max(previousDelivered, 0),
            ordersDelivered: previousDelivered,
            ordersReturned: 0,
          },
  });
}

describe("buildTopDelivered — Top N por entregas", () => {
  it("ordena por entregas desc y respeta el límite", () => {
    const inputs = [
      deliveredMember("a", 30, 10),
      deliveredMember("b", 100, 90),
      deliveredMember("c", 75, 70),
      deliveredMember("d", 5, 0),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const top = buildTopDelivered(radar.members, 2);
    expect(top.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("excluye miembros con cero entregas en el período", () => {
    const inputs = [
      deliveredMember("a", 0, 50),
      deliveredMember("b", 10, 5),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const top = buildTopDelivered(radar.members, 20);
    expect(top.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("buildDeclineCohort — alerta de caída sobre entregas", () => {
  it("incluye solo miembros con previousDelivered >= 50 y delta negativo", () => {
    const inputs = [
      // Cumple: previo 80, actual 40 → -40
      deliveredMember("drop-strong", 40, 80),
      // Cumple: previo 50, actual 30 → -20
      deliveredMember("drop-edge", 30, 50),
      // Excluido: previo 49 (debajo del umbral)
      deliveredMember("below-min", 10, 49),
      // Excluido: actual >= previo (no es caída)
      deliveredMember("flat", 80, 80),
      // Excluido: sin mes previo
      deliveredMember("new", 70, null),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const decline = buildDeclineCohort(radar.members);
    expect(decline.map((d) => d.member.id)).toEqual([
      "drop-strong",
      "drop-edge",
    ]);
    expect(decline[0].deliveredDelta).toBe(-40);
    expect(decline[1].deliveredDelta).toBe(-20);
  });

  it("ordena por mayor pérdida absoluta primero (no por porcentaje)", () => {
    const inputs = [
      // -10%, pérdida -50
      deliveredMember("big-absolute", 450, 500),
      // -50%, pérdida -25
      deliveredMember("big-pct", 25, 50),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const decline = buildDeclineCohort(radar.members);
    expect(decline[0].member.id).toBe("big-absolute");
    expect(decline[1].member.id).toBe("big-pct");
  });

  it("respeta minPrevious custom", () => {
    const inputs = [
      deliveredMember("drop", 30, 60),
      deliveredMember("under-100", 50, 80),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const decline = buildDeclineCohort(radar.members, 100);
    expect(decline).toHaveLength(0);
  });
});

describe("buildGrowthCohorts — bandas 10/20/30 sobre entregas mensuales", () => {
  it("clasifica a cada miembro en la banda mayor cumplida", () => {
    const inputs = [
      // +50% (cae en 30)
      deliveredMember("top-band", 150, 100),
      // +25% (cae en 20)
      deliveredMember("mid-band", 125, 100),
      // +15% (cae en 10)
      deliveredMember("low-band", 115, 100),
      // +5% (no llega a ninguna banda → fuera)
      deliveredMember("below-bands", 105, 100),
      // -10% (caída → fuera)
      deliveredMember("negative", 90, 100),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const buckets = buildGrowthCohorts(radar.members);
    const byBand = new Map(buckets.map((b) => [b.bandPct, b.members]));
    expect(byBand.get(30)?.map((g) => g.member.id)).toEqual(["top-band"]);
    expect(byBand.get(20)?.map((g) => g.member.id)).toEqual(["mid-band"]);
    expect(byBand.get(10)?.map((g) => g.member.id)).toEqual(["low-band"]);
  });

  it("excluye miembros con entregas actuales < 50 aunque crezcan mucho", () => {
    const inputs = [
      // +200% pero entregas actuales 30 → fuera
      deliveredMember("tiny-fast", 30, 10),
      // +30% con entregas actuales 65 → entra en banda 30
      deliveredMember("solid", 65, 50),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const buckets = buildGrowthCohorts(radar.members);
    const cohortIds = buckets.flatMap((b) =>
      b.members.map((g) => g.member.id),
    );
    expect(cohortIds).toEqual(["solid"]);
  });

  it("excluye miembros sin mes previo o con caída", () => {
    const inputs = [
      deliveredMember("new-no-prev", 200, null),
      deliveredMember("falling", 60, 80),
      deliveredMember("strong", 80, 50),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const cohortIds = buildGrowthCohorts(radar.members)
      .flatMap((b) => b.members.map((g) => g.member.id))
      .sort();
    expect(cohortIds).toEqual(["strong"]);
  });

  it("acepta override de bandas y umbral mínimo", () => {
    const inputs = [
      // +6% con 60 entregadas
      deliveredMember("smallish", 53, 50),
    ];
    const radar = buildRadar({
      current: CURRENT,
      previous: PREVIOUS,
      members: inputs,
    });
    const buckets = buildGrowthCohorts(radar.members, {
      minDelivered: 50,
      bandsPct: [5],
    });
    expect(buckets[0].bandPct).toBe(5);
    expect(buckets[0].members.map((g) => g.member.id)).toEqual(["smallish"]);
  });
});
