import { describe, it, expect } from "vitest";
import {
  calculateEnrollmentBalance,
  calculateInstallments,
  validateReferralSplitsSumTo100,
  canSellProductToStudent,
  shouldGenerateCommission,
  deriveDefaultCommissionBaseFromInitialPayment,
  getAutomaticTagNames,
  isActiveEnrollmentStatus,
} from "./operaciones-products";

describe("calculateEnrollmentBalance", () => {
  it("sums officialAmountUsd when present", () => {
    const balance = calculateEnrollmentBalance(3000, [
      { officialAmountUsd: 1000, amount: 1000 },
      { officialAmountUsd: 500, amount: 2_000_000, currency: "COP" },
    ]);
    expect(balance.paidUsd).toBe(1500);
    expect(balance.balanceUsd).toBe(1500);
    expect(balance.isPaidInFull).toBe(false);
  });

  it("falls back to amount only for USD payments when no official USD value", () => {
    const balance = calculateEnrollmentBalance(1000, [
      { amount: 600, currency: "USD" },
      // No FX resolved — must be ignored, not silently summed as USD.
      { amount: 1_500_000, currency: "COP" },
    ]);
    expect(balance.paidUsd).toBe(600);
    expect(balance.balanceUsd).toBe(400);
  });

  it("treats USD assumption when currency is missing", () => {
    const balance = calculateEnrollmentBalance(500, [{ amount: 500 }]);
    expect(balance.isPaidInFull).toBe(true);
  });

  it("flags isPaidInFull within one-cent tolerance", () => {
    const balance = calculateEnrollmentBalance(100, [
      { officialAmountUsd: "99.995", amount: 100 },
    ]);
    expect(balance.isPaidInFull).toBe(true);
  });

  it("supports string Decimal inputs from Prisma", () => {
    const balance = calculateEnrollmentBalance("1500.00", [
      { officialAmountUsd: "500.00", amount: "500.00" },
    ]);
    expect(balance.paidUsd).toBe(500);
    expect(balance.balanceUsd).toBe(1000);
  });
});

describe("calculateInstallments", () => {
  it("distributes total across installments with last row absorbing the remainder", () => {
    const rows = calculateInstallments(1000, 3, new Date("2026-06-01T00:00:00Z"));
    expect(rows.map((r) => r.amountDue)).toEqual([333.33, 333.33, 333.34]);
    const sum = rows.reduce((acc, r) => acc + r.amountDue, 0);
    expect(Math.abs(sum - 1000)).toBeLessThan(0.001);
  });

  it("advances dueDate one month between rows by default", () => {
    const rows = calculateInstallments(900, 3, new Date("2026-06-15T00:00:00Z"));
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe("2026-08-15");
  });

  it("clamps day-of-month for short months (Jan 31 -> Feb 28)", () => {
    const rows = calculateInstallments(300, 3, new Date("2026-01-31T00:00:00Z"));
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("advances by 14 days for biweekly frequency", () => {
    const rows = calculateInstallments(600, 3, new Date("2026-06-01T00:00:00Z"), "biweekly");
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("rejects non-positive installments and invalid totals", () => {
    expect(() => calculateInstallments(1000, 0, new Date("2026-06-01"))).toThrow();
    expect(() => calculateInstallments(-1, 2, new Date("2026-06-01"))).toThrow();
    expect(() => calculateInstallments(100, 2, new Date("invalid"))).toThrow();
  });

  it("supports a single installment equal to the total", () => {
    const rows = calculateInstallments(750, 1, new Date("2026-06-01T00:00:00Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountDue).toBe(750);
  });
});

describe("validateReferralSplitsSumTo100", () => {
  it("returns true for empty splits", () => {
    expect(validateReferralSplitsSumTo100([])).toBe(true);
  });

  it("returns true when splits sum to exactly 100", () => {
    expect(validateReferralSplitsSumTo100([60, 40])).toBe(true);
    expect(validateReferralSplitsSumTo100([33.33, 33.33, 33.34])).toBe(true);
  });

  it("tolerates Decimal string inputs", () => {
    expect(validateReferralSplitsSumTo100(["50.00", "50.00"])).toBe(true);
  });

  it("returns false when splits do not sum to 100", () => {
    expect(validateReferralSplitsSumTo100([50, 40])).toBe(false);
    expect(validateReferralSplitsSumTo100([110])).toBe(false);
  });
});

describe("canSellProductToStudent", () => {
  it("allows the first ONE_PER_STUDENT enrollment", () => {
    expect(canSellProductToStudent("ONE_PER_STUDENT", 0)).toBe(true);
  });

  it("blocks a second ONE_PER_STUDENT enrollment", () => {
    expect(canSellProductToStudent("ONE_PER_STUDENT", 1)).toBe(false);
  });

  it("always allows UNLIMITED products", () => {
    expect(canSellProductToStudent("UNLIMITED", 0)).toBe(true);
    expect(canSellProductToStudent("UNLIMITED", 5)).toBe(true);
  });

  it("rejects a negative active count defensively", () => {
    expect(canSellProductToStudent("UNLIMITED", -1)).toBe(false);
  });
});

describe("isActiveEnrollmentStatus", () => {
  it("treats ACTIVE and PAUSED as still occupying the slot", () => {
    expect(isActiveEnrollmentStatus("ACTIVE")).toBe(true);
    expect(isActiveEnrollmentStatus("PAUSED")).toBe(true);
  });
  it("treats terminal statuses as not occupying the slot", () => {
    expect(isActiveEnrollmentStatus("COMPLETED")).toBe(false);
    expect(isActiveEnrollmentStatus("CANCELLED")).toBe(false);
    expect(isActiveEnrollmentStatus("REFUNDED")).toBe(false);
  });
});

describe("shouldGenerateCommission", () => {
  it("requires both a referral and an initial payment", () => {
    expect(
      shouldGenerateCommission({ isInitialPayment: true, initialPaymentType: "FULL_PAYMENT" }, false),
    ).toBe(false);
    expect(
      shouldGenerateCommission({ isInitialPayment: false, initialPaymentType: "FULL_PAYMENT" }, true),
    ).toBe(false);
  });

  it("triggers on FULL_PAYMENT or DOWN_PAYMENT", () => {
    expect(
      shouldGenerateCommission({ isInitialPayment: true, initialPaymentType: "FULL_PAYMENT" }, true),
    ).toBe(true);
    expect(
      shouldGenerateCommission({ isInitialPayment: true, initialPaymentType: "DOWN_PAYMENT" }, true),
    ).toBe(true);
  });

  it("does not trigger on a RESERVATION initial payment", () => {
    expect(
      shouldGenerateCommission({ isInitialPayment: true, initialPaymentType: "RESERVATION" }, true),
    ).toBe(false);
  });

  it("does not trigger when initialPaymentType is missing", () => {
    expect(
      shouldGenerateCommission({ isInitialPayment: true, initialPaymentType: null }, true),
    ).toBe(false);
  });
});

describe("deriveDefaultCommissionBaseFromInitialPayment", () => {
  it("returns 0 for null/undefined and non-commissionable payments", () => {
    expect(deriveDefaultCommissionBaseFromInitialPayment(null)).toBe(0);
    expect(deriveDefaultCommissionBaseFromInitialPayment(undefined)).toBe(0);
    expect(
      deriveDefaultCommissionBaseFromInitialPayment({
        isInitialPayment: false,
        initialPaymentType: "FULL_PAYMENT",
        amount: 1000,
        currency: "USD",
      }),
    ).toBe(0);
  });

  it("uses officialAmountUsd when present", () => {
    const base = deriveDefaultCommissionBaseFromInitialPayment({
      isInitialPayment: true,
      initialPaymentType: "FULL_PAYMENT",
      officialAmountUsd: "1234.56",
      amount: 5_000_000,
      currency: "COP",
    });
    expect(base).toBe(1234.56);
  });

  it("falls back to amount only when currency is USD", () => {
    expect(
      deriveDefaultCommissionBaseFromInitialPayment({
        isInitialPayment: true,
        initialPaymentType: "DOWN_PAYMENT",
        amount: 500,
        currency: "USD",
      }),
    ).toBe(500);

    expect(
      deriveDefaultCommissionBaseFromInitialPayment({
        isInitialPayment: true,
        initialPaymentType: "DOWN_PAYMENT",
        amount: 5_000_000,
        currency: "COP",
      }),
    ).toBe(0);
  });

  it("returns 0 for RESERVATION even if amount is positive", () => {
    expect(
      deriveDefaultCommissionBaseFromInitialPayment({
        isInitialPayment: true,
        initialPaymentType: "RESERVATION",
        amount: 200,
        currency: "USD",
      }),
    ).toBe(0);
  });
});

describe("getAutomaticTagNames", () => {
  it("returns no tags for a vanilla active student", () => {
    expect(
      getAutomaticTagNames({
        status: "ACTIVE",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "ACTIVE",
      }),
    ).toEqual([]);
  });

  it("maps lifecycle statuses to canonical names", () => {
    expect(
      getAutomaticTagNames({
        status: "COMPLETED",
        mentorshipStatus: "FINISHED",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Graduados", "Mentoría finalizada"]);

    expect(
      getAutomaticTagNames({
        status: "DROPPED",
        mentorshipStatus: "FINISHED",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Bajas", "Mentoría finalizada"]);
  });

  it("maps newly-added lifecycle values (SEPARATED/INACTIVE/WITHDRAWN)", () => {
    expect(
      getAutomaticTagNames({
        status: "SEPARATED",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Separados"]);

    expect(
      getAutomaticTagNames({
        status: "INACTIVE",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Inactivos"]);

    expect(
      getAutomaticTagNames({
        status: "WITHDRAWN",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Retirados"]);
  });

  it("deduplicates when ACCESS_REVOKED + revoked access overlap", () => {
    expect(
      getAutomaticTagNames({
        status: "ACCESS_REVOKED",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "REVOKED",
      }),
    ).toEqual(["Acceso revocado"]);
  });

  it("combines paused mentorship with paused lifecycle", () => {
    expect(
      getAutomaticTagNames({
        status: "PAUSED",
        mentorshipStatus: "PAUSED",
        accessStatus: "ACTIVE",
      }),
    ).toEqual(["Pausados", "Mentoría pausada"]);
  });

  it("flags SUSPENDED access independently of lifecycle", () => {
    expect(
      getAutomaticTagNames({
        status: "ACTIVE",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "SUSPENDED",
      }),
    ).toEqual(["Acceso suspendido"]);
  });

  it("flags PENDING access for newly created enrollments", () => {
    expect(
      getAutomaticTagNames({
        status: "ACTIVE",
        mentorshipStatus: "NOT_STARTED",
        accessStatus: "PENDING",
      }),
    ).toEqual(["Mentoría no iniciada", "Acceso pendiente"]);
  });

  it("flags SYNC_ERROR access for failed LW provisioning", () => {
    expect(
      getAutomaticTagNames({
        status: "ACTIVE",
        mentorshipStatus: "IN_PROGRESS",
        accessStatus: "SYNC_ERROR",
      }),
    ).toEqual(["Error de sincronización LW"]);
  });
});
