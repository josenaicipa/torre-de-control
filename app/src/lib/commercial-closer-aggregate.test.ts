import { describe, expect, it } from "vitest";
import {
  AREA_COMERCIAL_PRIORITY_START,
  areaComercialHasPriority,
  closerCanonId,
  deriveCommercialCloserAggregate,
  isHighTicketCloserReportingMember,
  shouldRecomputeCommercialCloser,
  type DailyEntryRow,
} from "./commercial-closer-aggregate";

/**
 * Server-side derivation of the high-ticket commercial aggregate (daily_closer)
 * from daily_entries. Mirrors the legacy browser logic so the aggregate stays
 * identical after we move persistence server-side (RBAC-safe fix for the
 * scoped-closer HTTP 403 on control.unlockedecom.co).
 */

function row(overrides: Partial<DailyEntryRow>): DailyEntryRow {
  return { date: "2026-06-17", member: "Daryi Perez", ...overrides };
}

describe("closerCanonId", () => {
  it("maps legacy member ids to their canonical closer id", () => {
    expect(closerCanonId("Daryi")).toBe("Daryi Perez");
    expect(closerCanonId("Carlos")).toBe("Carlos Velez");
    expect(closerCanonId("Juan Diego Afanador")).toBe("Wiston Quintero");
  });

  it("does not canonicalize active setter ids into same-name closer profiles", () => {
    expect(closerCanonId("Alejandro Gallo")).toBe("Alejandro Gallo");
    expect(closerCanonId("Daniel Garcia")).toBe("Daniel Garcia");
  });

  it("returns canonical/unknown ids unchanged", () => {
    expect(closerCanonId("Daryi Perez")).toBe("Daryi Perez");
    expect(closerCanonId("Someone Else")).toBe("Someone Else");
    expect(closerCanonId("")).toBe("");
  });
});

describe("areaComercialHasPriority", () => {
  it("is true on/after the commercial-priority start date", () => {
    expect(areaComercialHasPriority(AREA_COMERCIAL_PRIORITY_START)).toBe(true);
    expect(areaComercialHasPriority("2026-06-17")).toBe(true);
    expect(areaComercialHasPriority("2026-12-31")).toBe(true);
  });

  it("is false before the commercial-priority start date", () => {
    expect(areaComercialHasPriority("2026-05-31")).toBe(false);
    expect(areaComercialHasPriority("2025-01-01")).toBe(false);
  });
});

describe("isHighTicketCloserReportingMember", () => {
  it("recognizes canonical closers in June 2026", () => {
    expect(isHighTicketCloserReportingMember("Daryi Perez", "2026-06-17")).toBe(true);
    expect(isHighTicketCloserReportingMember("Carlos Velez", "2026-06-01")).toBe(true);
  });

  it("excludes Admin/Valentina from the high-ticket closer set", () => {
    expect(isHighTicketCloserReportingMember("Admin", "2026-06-17")).toBe(false);
    expect(isHighTicketCloserReportingMember("Admin", "2026-07-15")).toBe(false);
  });

  it("treats canonical closers as reporting members after June too", () => {
    expect(isHighTicketCloserReportingMember("Daryi Perez", "2026-07-15")).toBe(true);
  });

  it("rejects non-closer members", () => {
    expect(isHighTicketCloserReportingMember("Karen", "2026-06-17")).toBe(false);
    expect(isHighTicketCloserReportingMember("Lucas Soria", "2026-06-17")).toBe(false);
  });
});

describe("shouldRecomputeCommercialCloser", () => {
  it("is true for a high-ticket closer inside the priority period (legacy alias accepted)", () => {
    expect(shouldRecomputeCommercialCloser("Daryi Perez", "2026-06-17")).toBe(true);
    expect(shouldRecomputeCommercialCloser("Daryi", "2026-06-17")).toBe(true);
  });

  it("is false before the priority period even for a closer", () => {
    expect(shouldRecomputeCommercialCloser("Daryi Perez", "2026-05-30")).toBe(false);
  });

  it("is false for non-closer members", () => {
    expect(shouldRecomputeCommercialCloser("Karen", "2026-06-17")).toBe(false);
    expect(shouldRecomputeCommercialCloser("Admin", "2026-06-17")).toBe(false);
    expect(shouldRecomputeCommercialCloser("Alejandro Gallo", "2026-06-17")).toBe(false);
    expect(shouldRecomputeCommercialCloser("Daniel Garcia", "2026-06-17")).toBe(false);
  });
});

describe("deriveCommercialCloserAggregate", () => {
  it("returns null before the commercial-priority period (legacy row stays manual)", () => {
    const rows = [row({ date: "2026-05-30", sales_organic: 3 })];
    expect(deriveCommercialCloserAggregate("2026-05-30", rows)).toBeNull();
  });

  it("sums the mapped daily_entries columns across all high-ticket closers for the date", () => {
    const rows: DailyEntryRow[] = [
      row({
        member: "Daryi Perez",
        sales_organic: 2,
        revenue_organic: 5000,
        cash_organic: 3000,
        recurring_organic: 400,
      }),
      row({
        member: "Carlos", // legacy alias → canonicalizes to a closer
        sales_organic: 1,
        revenue_organic: 2500,
        cash_organic: 1000,
        recurring_organic: 100,
      }),
    ];
    const agg = deriveCommercialCloserAggregate("2026-06-17", rows);
    expect(agg).toEqual({
      date: "2026-06-17",
      q_ventas_ht: 3,
      valor_venta_ht: 7500,
      upfront_cash_ht: 4000,
      ventas_cash: 4000, // legacy cashCollected||upfrontCash both map to cash_organic
      recurring_cash: 500,
    });
  });

  it("ignores rows from other dates and non-closer members", () => {
    const rows: DailyEntryRow[] = [
      row({ member: "Daryi Perez", sales_organic: 4, revenue_organic: 9000 }),
      row({ date: "2026-06-18", member: "Daryi Perez", sales_organic: 99 }), // other date
      row({ member: "Karen", sales_organic: 50 }), // not a closer
      row({ member: "Admin", sales_organic: 50 }), // admin excluded from HT closer set
      row({ member: "Alejandro Gallo", sales_organic: 50 }), // active setter, not closer alias
      row({ member: "Daniel Garcia", sales_organic: 50 }), // active setter, not closer alias
    ];
    const agg = deriveCommercialCloserAggregate("2026-06-17", rows);
    expect(agg?.q_ventas_ht).toBe(4);
    expect(agg?.valor_venta_ht).toBe(9000);
  });

  it("coerces missing/non-numeric column values to zero", () => {
    const rows: DailyEntryRow[] = [
      row({ member: "Daryi Perez", sales_organic: undefined, revenue_organic: "oops" }),
    ];
    const agg = deriveCommercialCloserAggregate("2026-06-17", rows);
    expect(agg).toEqual({
      date: "2026-06-17",
      q_ventas_ht: 0,
      valor_venta_ht: 0,
      upfront_cash_ht: 0,
      ventas_cash: 0,
      recurring_cash: 0,
    });
  });

  it("produces an empty (all-zero) aggregate when no closer rows exist for the date", () => {
    const agg = deriveCommercialCloserAggregate("2026-06-17", []);
    expect(agg).toEqual({
      date: "2026-06-17",
      q_ventas_ht: 0,
      valor_venta_ht: 0,
      upfront_cash_ht: 0,
      ventas_cash: 0,
      recurring_cash: 0,
    });
  });
});
