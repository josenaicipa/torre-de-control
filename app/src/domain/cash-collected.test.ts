import { describe, it, expect } from "vitest";
import {
  classifySource,
  classifyTicket,
  classifyPayments,
  summarize,
  HIGH_TICKET_RESERVA_THRESHOLD,
  type RawPayment,
} from "./cash-collected";

// Helper: build a raw payment with sensible defaults so each test only states
// the fields it cares about.
function payment(overrides: Partial<RawPayment> & Pick<RawPayment, "amountUsd">): RawPayment {
  return {
    leadEmail: "lead@example.com",
    leadName: "Lead",
    paidAt: "2026-05-01T00:00:00.000Z",
    source: "Hotmart",
    buyerType: "high_ticket",
    ...overrides,
  };
}

describe("classifySource", () => {
  it("treats Hotmart as official: contributes to cash, no review", () => {
    const result = classifySource("Hotmart");
    expect(result).toEqual({ contributesToCash: true, reviewRequired: false, reviewReason: null });
  });

  it("treats Stripe as official regardless of casing", () => {
    expect(classifySource("stripe").reviewRequired).toBe(false);
    expect(classifySource("STRIPE").reviewRequired).toBe(false);
  });

  it("flags Manual as reviewRequired but still contributing to cash", () => {
    const result = classifySource("Manual");
    expect(result.contributesToCash).toBe(true);
    expect(result.reviewRequired).toBe(true);
    expect(result.reviewReason).toContain("Manual");
  });

  it("flags unknown/empty source as reviewRequired", () => {
    expect(classifySource("").reviewRequired).toBe(true);
    expect(classifySource(null).reviewRequired).toBe(true);
    expect(classifySource("WeirdGateway").reviewRequired).toBe(true);
  });
});

describe("classifyTicket", () => {
  it("classifies any low-ticket payment as LOW_TICKET", () => {
    expect(classifyTicket({ buyerType: "low_ticket", amountUsd: 9.9, cumulativeBefore: 0 })).toBe(
      "LOW_TICKET",
    );
  });

  it("keeps a high-ticket lead's first sub-threshold payment as RESERVA", () => {
    expect(classifyTicket({ buyerType: "high_ticket", amountUsd: 200, cumulativeBefore: 0 })).toBe(
      "RESERVA",
    );
  });

  it("keeps cumulative 200+200 = 400 as RESERVA", () => {
    expect(classifyTicket({ buyerType: "high_ticket", amountUsd: 200, cumulativeBefore: 200 })).toBe(
      "RESERVA",
    );
  });

  it("treats exactly 450 cumulative as RESERVA (uses > not >=)", () => {
    expect(classifyTicket({ buyerType: "high_ticket", amountUsd: 250, cumulativeBefore: 200 })).toBe(
      "RESERVA",
    );
  });

  it("classifies the payment that crosses 450 as HIGH_TICKET", () => {
    expect(classifyTicket({ buyerType: "high_ticket", amountUsd: 100, cumulativeBefore: 400 })).toBe(
      "HIGH_TICKET",
    );
  });

  it("classifies payments once the lead is already past 450 as HIGH_TICKET", () => {
    expect(classifyTicket({ buyerType: "high_ticket", amountUsd: 50, cumulativeBefore: 500 })).toBe(
      "HIGH_TICKET",
    );
  });

  it("returns UNKNOWN for unrecognized buyer types", () => {
    expect(classifyTicket({ buyerType: "mystery", amountUsd: 100, cumulativeBefore: 0 })).toBe(
      "UNKNOWN",
    );
    expect(classifyTicket({ buyerType: null, amountUsd: 100, cumulativeBefore: 0 })).toBe("UNKNOWN");
  });

  it("uses 450 as the documented threshold constant", () => {
    expect(HIGH_TICKET_RESERVA_THRESHOLD).toBe(450);
  });
});

describe("classifyPayments — high-ticket reserva progression", () => {
  it("walks 200 → 200 → 100 → later as RESERVA, RESERVA, HIGH_TICKET, HIGH_TICKET", () => {
    const lead = "ht@example.com";
    const raw: RawPayment[] = [
      payment({ leadEmail: lead, amountUsd: 200, paidAt: "2026-05-01T00:00:00Z" }),
      payment({ leadEmail: lead, amountUsd: 200, paidAt: "2026-05-02T00:00:00Z" }),
      payment({ leadEmail: lead, amountUsd: 100, paidAt: "2026-05-03T00:00:00Z" }),
      payment({ leadEmail: lead, amountUsd: 80, paidAt: "2026-05-04T00:00:00Z" }),
    ];
    const result = classifyPayments(raw);
    expect(result.map((r) => r.classification)).toEqual([
      "RESERVA",
      "RESERVA",
      "HIGH_TICKET",
      "HIGH_TICKET",
    ]);
  });

  it("applies the cumulative rule in chronological order even when input is shuffled", () => {
    const lead = "ht@example.com";
    const raw: RawPayment[] = [
      payment({ leadEmail: lead, amountUsd: 100, paidAt: "2026-05-03T00:00:00Z" }), // 3rd
      payment({ leadEmail: lead, amountUsd: 200, paidAt: "2026-05-01T00:00:00Z" }), // 1st
      payment({ leadEmail: lead, amountUsd: 200, paidAt: "2026-05-02T00:00:00Z" }), // 2nd
    ];
    const result = classifyPayments(raw);
    // Output order matches input order, but classification reflects chronology.
    expect(result[0].classification).toBe("HIGH_TICKET"); // the 100 paid 3rd crosses 450
    expect(result[1].classification).toBe("RESERVA"); // 200 paid 1st
    expect(result[2].classification).toBe("RESERVA"); // 200 paid 2nd
  });

  it("keeps separate leads' cumulatives independent", () => {
    const raw: RawPayment[] = [
      payment({ leadEmail: "a@x.com", amountUsd: 500, paidAt: "2026-05-01T00:00:00Z" }),
      payment({ leadEmail: "b@x.com", amountUsd: 200, paidAt: "2026-05-01T00:00:00Z" }),
    ];
    const result = classifyPayments(raw);
    expect(result[0].classification).toBe("HIGH_TICKET"); // a crosses 450 immediately
    expect(result[1].classification).toBe("RESERVA"); // b stays under 450
  });

  it("classifies a low-ticket lead's payments as LOW_TICKET regardless of amount", () => {
    const raw: RawPayment[] = [
      payment({ leadEmail: "lt@x.com", buyerType: "low_ticket", amountUsd: 9.9 }),
      payment({ leadEmail: "lt@x.com", buyerType: "low_ticket", amountUsd: 600 }),
    ];
    const result = classifyPayments(raw);
    expect(result.map((r) => r.classification)).toEqual(["LOW_TICKET", "LOW_TICKET"]);
  });
});

describe("classifyPayments — source review flags", () => {
  it("does not flag Stripe/Hotmart payments for review", () => {
    const raw: RawPayment[] = [
      payment({ source: "Stripe", buyerType: "low_ticket", amountUsd: 50 }),
      payment({ source: "Hotmart", buyerType: "low_ticket", amountUsd: 50 }),
    ];
    const result = classifyPayments(raw);
    expect(result.every((r) => r.reviewRequired === false)).toBe(true);
    expect(result.every((r) => r.contributesToCash === true)).toBe(true);
  });

  it("flags Manual/unknown payments for review but still counts them as cash", () => {
    const raw: RawPayment[] = [
      payment({ source: "Manual", buyerType: "low_ticket", amountUsd: 200 }),
      payment({ source: "WeirdGateway", buyerType: "low_ticket", amountUsd: 75 }),
    ];
    const result = classifyPayments(raw);
    expect(result.every((r) => r.reviewRequired === true)).toBe(true);
    expect(result.every((r) => r.contributesToCash === true)).toBe(true);
    expect(result[0].reviewReason).toContain("Manual");
  });
});

describe("summarize", () => {
  it("sums all contributing payments into Cash Collected and splits by metric", () => {
    const raw: RawPayment[] = [
      // low ticket, official
      payment({ leadEmail: "lt@x.com", buyerType: "low_ticket", source: "Hotmart", amountUsd: 100 }),
      // high ticket lead crossing the threshold: 300 (reserva) then 300 (sale)
      payment({ leadEmail: "ht@x.com", buyerType: "high_ticket", source: "Stripe", amountUsd: 300, paidAt: "2026-05-01T00:00:00Z" }),
      payment({ leadEmail: "ht@x.com", buyerType: "high_ticket", source: "Stripe", amountUsd: 300, paidAt: "2026-05-02T00:00:00Z" }),
      // manual payment to review
      payment({ leadEmail: "mn@x.com", buyerType: "low_ticket", source: "Manual", amountUsd: 200 }),
    ];
    const summary = summarize(classifyPayments(raw));

    expect(summary.cashCollected).toBe(900); // 100 + 300 + 300 + 200, everything counts
    expect(summary.lowTicket).toBe(300); // 100 + 200
    expect(summary.reservas).toBe(300); // first HT payment
    expect(summary.highTicket).toBe(300); // crossing HT payment
    expect(summary.reviewRequired).toBe(200); // the Manual payment
    expect(summary.counts.total).toBe(4);
    expect(summary.counts.reviewRequired).toBe(1);
  });

  it("returns zeroed totals for an empty batch", () => {
    const summary = summarize([]);
    expect(summary.cashCollected).toBe(0);
    expect(summary.counts.total).toBe(0);
  });
});
