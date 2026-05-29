import { describe, expect, it } from "vitest";
import {
  derivePaymentFx,
  paymentUsdAmount,
  resolveOfficialUsdOverride,
} from "./operaciones-payment-fx";

describe("derivePaymentFx", () => {
  it("USD account → amount equals officialAmountUsd, no rate", () => {
    const result = derivePaymentFx({ amount: 500, accountCurrency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        currency: "USD",
        officialAmountUsd: 500,
        receivedAmount: 500,
        receivedCurrency: "USD",
        exchangeRate: null,
      });
    }
  });

  it("COP account computes USD from amount / exchangeRate", () => {
    const result = derivePaymentFx({
      amount: 1_500_000,
      accountCurrency: "COP",
      exchangeRate: 4000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.currency).toBe("COP");
      expect(result.value.receivedCurrency).toBe("COP");
      expect(result.value.officialAmountUsd).toBe(375);
      expect(result.value.exchangeRate).toBe(4000);
    }
  });

  it("explicit officialAmountUsd overrides amount/rate computation", () => {
    const result = derivePaymentFx({
      amount: 1_500_000,
      accountCurrency: "COP",
      exchangeRate: 4000,
      officialAmountUsd: 411.34,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.officialAmountUsd).toBe(411.34);
    }
  });

  it("rejects non-USD account without rate or USD override", () => {
    const result = derivePaymentFx({
      amount: 1_500_000,
      accountCurrency: "COP",
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveOfficialUsdOverride", () => {
  const existing = {
    amount: 1_500_000,
    exchangeRate: 4000,
    officialAmountUsd: 375,
    paymentAccountId: "acct_cop",
  };

  it("returns explicit override from body when provided", () => {
    expect(
      resolveOfficialUsdOverride({
        body: { officialAmountUsd: 411.34 },
        existing,
      }),
    ).toBe(411.34);
  });

  it("preserves an explicit null override (operator clearing the field)", () => {
    expect(
      resolveOfficialUsdOverride({
        body: { officialAmountUsd: null },
        existing,
      }),
    ).toBeNull();
  });

  it("returns null when amount changed and no override was sent", () => {
    expect(
      resolveOfficialUsdOverride({
        body: { amount: 2_000_000 },
        existing,
      }),
    ).toBeNull();
  });

  it("returns null when exchangeRate changed and no override was sent", () => {
    expect(
      resolveOfficialUsdOverride({
        body: { exchangeRate: 4200 },
        existing,
      }),
    ).toBeNull();
  });

  it("returns null when paymentAccountId changed", () => {
    expect(
      resolveOfficialUsdOverride({
        body: { paymentAccountId: "acct_other" },
        existing,
      }),
    ).toBeNull();
  });

  it("conserves existing USD when nothing relevant changed", () => {
    expect(
      resolveOfficialUsdOverride({
        body: {},
        existing,
      }),
    ).toBe(375);
  });

  it("conserves existing USD when the body echoes unchanged values", () => {
    expect(
      resolveOfficialUsdOverride({
        body: {
          amount: 1_500_000,
          exchangeRate: 4000,
          paymentAccountId: "acct_cop",
        },
        existing,
      }),
    ).toBe(375);
  });
});

describe("paymentUsdAmount", () => {
  it("uses officialAmountUsd when present", () => {
    expect(
      paymentUsdAmount({
        amount: "1500000",
        currency: "COP",
        officialAmountUsd: "375.00",
      }),
    ).toBe(375);
  });

  it("falls back to amount only when currency is USD", () => {
    expect(paymentUsdAmount({ amount: "500", currency: "USD" })).toBe(500);
    expect(paymentUsdAmount({ amount: "1500000", currency: "COP" })).toBe(0);
  });
});
