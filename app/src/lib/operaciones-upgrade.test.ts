import { describe, expect, it } from "vitest";
import {
  buildUpgradeAmounts,
  calculateUpgradeCredit,
  canUpgradeToLevel,
} from "./operaciones-upgrade";

describe("canUpgradeToLevel", () => {
  it("allows moving up the ladder", () => {
    expect(canUpgradeToLevel(3, 4)).toBe(true);
    expect(canUpgradeToLevel(3, 5)).toBe(true);
    expect(canUpgradeToLevel(4, 5)).toBe(true);
  });

  it("rejects same or lower level", () => {
    expect(canUpgradeToLevel(4, 4)).toBe(false);
    expect(canUpgradeToLevel(5, 3)).toBe(false);
    expect(canUpgradeToLevel(5, 4)).toBe(false);
  });

  it("rejects missing levels", () => {
    expect(canUpgradeToLevel(null, 4)).toBe(false);
    expect(canUpgradeToLevel(3, null)).toBe(false);
    expect(canUpgradeToLevel(undefined, undefined)).toBe(false);
  });
});

describe("calculateUpgradeCredit", () => {
  it("sums official USD values when present", () => {
    const credit = calculateUpgradeCredit([
      { officialAmountUsd: 200, amount: 800000, currency: "COP" },
      { officialAmountUsd: 150, amount: 600000, currency: "COP" },
    ]);
    expect(credit).toBe(350);
  });

  it("falls back to amount only for USD payments", () => {
    const credit = calculateUpgradeCredit([
      { amount: 300, currency: "USD" },
      { amount: 100 }, // currency unset -> treated as USD
    ]);
    expect(credit).toBe(400);
  });

  it("ignores non-USD payments without official USD", () => {
    const credit = calculateUpgradeCredit([
      { amount: 1_000_000, currency: "COP" },
      { officialAmountUsd: 250, amount: 1_000_000, currency: "COP" },
    ]);
    expect(credit).toBe(250);
  });

  it("returns 0 for no payments", () => {
    expect(calculateUpgradeCredit([])).toBe(0);
  });
});

describe("buildUpgradeAmounts", () => {
  it("computes net = gross - credit (N3 750 -> N4 3000, paid 750)", () => {
    const result = buildUpgradeAmounts(3000, 750);
    expect(result.grossProgramPriceUsd).toBe(3000);
    expect(result.upgradeCreditUsd).toBe(750);
    expect(result.netAmountUsd).toBe(2250);
    expect(result.fullyCoveredByCredit).toBe(false);
  });

  it("uses only what was really paid, not the theoretical price", () => {
    // Student bought N3 at 750 but only paid 400 so far.
    const result = buildUpgradeAmounts(5000, 400);
    expect(result.upgradeCreditUsd).toBe(400);
    expect(result.netAmountUsd).toBe(4600);
  });

  it("caps the credit at the new gross so net never goes negative", () => {
    const result = buildUpgradeAmounts(3000, 5000);
    expect(result.upgradeCreditUsd).toBe(3000);
    expect(result.netAmountUsd).toBe(0);
    expect(result.fullyCoveredByCredit).toBe(true);
  });

  it("accepts string/Decimal-like inputs", () => {
    const result = buildUpgradeAmounts("3000.00", "750.00");
    expect(result.netAmountUsd).toBe(2250);
  });
});
