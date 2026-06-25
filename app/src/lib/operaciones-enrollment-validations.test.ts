import { describe, expect, it } from "vitest";
import {
  createStudentProductEnrollmentSchema,
  initialPaymentInputSchema,
} from "./operaciones-validations";
import { buildEnrollmentScheduleRows } from "./operaciones-products";
import {
  EnrollmentValidationError,
  prepareEnrollmentCreate,
  type EnrollmentRequestBody,
} from "./operaciones-enrollments";

const validStudentId = "cmav9cy3g000008l22t111111";
const validProductId = "cmav9cy3g000008l22t222222";
const validAccountId = "cmav9cy3g000008l22t333333";

describe("initialPaymentInputSchema", () => {
  it("accepts the minimal required shape", () => {
    const parsed = initialPaymentInputSchema.parse({
      amount: 500,
      paidAt: "2026-06-01",
      initialPaymentType: "DOWN_PAYMENT",
    });
    expect(parsed.currency).toBe("USD");
    expect(parsed.initialPaymentType).toBe("DOWN_PAYMENT");
  });

  it("accepts FX-resolved fields (officialAmountUsd + received + exchangeRate)", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 1000,
      currency: "USD",
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
      officialAmountUsd: 1000,
      receivedAmount: 4_000_000,
      receivedCurrency: "COP",
      exchangeRate: 4000,
      paymentAccountId: validAccountId,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid paidAt format", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 500,
      paidAt: "06/01/2026",
      initialPaymentType: "FULL_PAYMENT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 0,
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown initialPaymentType", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 100,
      paidAt: "2026-06-01",
      initialPaymentType: "PARTIAL" as never,
    });
    expect(result.success).toBe(false);
  });

  // The schema treats `officialAmountUsd` as optional; the *route* enforces
  // that non-USD initial payments must carry officialAmountUsd > 0 (because
  // the enrollment balance is denominated in USD). These two cases pin down
  // that the schema layer accepts both shapes — see the route in
  // app/src/app/api/operaciones/students/[id]/products/route.ts for the
  // business-rule check.
  it("accepts a non-USD initial payment when officialAmountUsd is provided", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 900_000,
      currency: "COP",
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
      officialAmountUsd: 225,
      receivedAmount: 900_000,
      receivedCurrency: "COP",
      exchangeRate: 4000,
      paymentAccountId: validAccountId,
    });
    expect(result.success).toBe(true);
  });

  it("schema also accepts a non-USD initial payment without officialAmountUsd (route enforces the rule)", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 900_000,
      currency: "COP",
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
      paymentAccountId: validAccountId,
    });
    expect(result.success).toBe(true);
  });

  // Bug repro: una reserva COP por 1.500.000 (~USD 411.34) era rechazada con
  // "Too big: expected number to be <=1000000". El cap de 1M sólo aplica al
  // monto canónico USD; el `amount` se guarda en la moneda recibida (COP) y
  // puede ser mucho mayor.
  it("accepts a COP RESERVATION with amount above the USD cap when officialAmountUsd is in range", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 1_500_000,
      currency: "COP",
      paidAt: "2026-06-01",
      initialPaymentType: "RESERVATION",
      paymentAccountId: validAccountId,
      officialAmountUsd: 411.34,
      receivedAmount: 1_500_000,
      receivedCurrency: "COP",
      exchangeRate: 3645,
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a USD amount above 1M (USD cap unchanged)", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 1_500_000,
      currency: "USD",
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
      paymentAccountId: validAccountId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues.find((i) => i.path[0] === "amount")?.message;
      expect(msg).toContain("USD");
      expect(msg).toContain("1.000.000");
    }
  });

  it("rejects a non-USD amount above 1B (local-currency cap)", () => {
    const result = initialPaymentInputSchema.safeParse({
      amount: 2_000_000_000,
      currency: "COP",
      paidAt: "2026-06-01",
      initialPaymentType: "FULL_PAYMENT",
      paymentAccountId: validAccountId,
      officialAmountUsd: 500,
    });
    expect(result.success).toBe(false);
  });
});

describe("createStudentProductEnrollmentSchema", () => {
  it("defaults installmentFrequency to monthly and grantAccessNow to false", () => {
    const parsed = createStudentProductEnrollmentSchema.parse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
    });
    expect(parsed.installmentFrequency).toBe("monthly");
    expect(parsed.grantAccessNow).toBe(false);
    expect(parsed.currency).toBe("USD");
  });

  it("accepts a full enrollment payload with initial payment and installment plan", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
      initialPaymentUsd: 1000,
      installmentCount: 4,
      firstDueDate: "2026-07-01",
      installmentFrequency: "biweekly",
      grantAccessNow: true,
      paymentAccountId: validAccountId,
      initialPayment: {
        amount: 1000,
        currency: "USD",
        paidAt: "2026-06-01",
        initialPaymentType: "DOWN_PAYMENT",
        paymentAccountId: validAccountId,
        officialAmountUsd: 1000,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid initialPayment payload", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
      initialPayment: {
        amount: 1000,
        paidAt: "06/01/2026",
        initialPaymentType: "DOWN_PAYMENT",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid installmentFrequency", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
      installmentFrequency: "weekly" as never,
    });
    expect(result.success).toBe(false);
  });

  it("allows omitting initialPayment (route enforces it for requiresInitialPayment products)", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optional upgradeFromEnrollmentId (cuid)", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
      upgradeFromEnrollmentId: "cmav9cy3g000008l22t444444",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.upgradeFromEnrollmentId).toBe(
        "cmav9cy3g000008l22t444444",
      );
    }
  });

  it("leaves upgradeFromEnrollmentId undefined for a normal sale", () => {
    const parsed = createStudentProductEnrollmentSchema.parse({
      studentId: validStudentId,
      productId: validProductId,
      totalAmountUsd: 3000,
    });
    expect(parsed.upgradeFromEnrollmentId).toBeUndefined();
  });

  it("rejects a non-cuid upgradeFromEnrollmentId", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      totalAmountUsd: 3000,
      upgradeFromEnrollmentId: "not-a-cuid",
    });
    expect(result.success).toBe(false);
  });

  // Caso de alta: estudiante creado con una RESERVA en COP por 1.500.000
  // (oficial USD 411.34). Antes del fix, el cap de 1M en `initialPayment.amount`
  // tumbaba la validación con "Validación fallida: Venta inicial: Too big...".
  it("accepts a RESERVATION initial payment in COP for the new-student enrollment flow", () => {
    const result = createStudentProductEnrollmentSchema.safeParse({
      studentId: validStudentId,
      productId: validProductId,
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
      paymentAccountId: validAccountId,
      initialPayment: {
        amount: 1_500_000,
        currency: "COP",
        paidAt: "2026-06-01",
        initialPaymentType: "RESERVATION",
        paymentAccountId: validAccountId,
        officialAmountUsd: 411.34,
        receivedAmount: 1_500_000,
        receivedCurrency: "COP",
        exchangeRate: 3645,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("buildEnrollmentScheduleRows", () => {
  it("returns empty when balance is fully covered by initial payment", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 1000,
      initialPaymentUsd: 1000,
      installmentCount: 3,
      firstDueDate: new Date("2026-07-01T00:00:00Z"),
    });
    expect(rows).toEqual([]);
  });

  it("returns empty when no installment count is provided", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 1000,
      initialPaymentUsd: 0,
      installmentCount: null,
      firstDueDate: new Date("2026-07-01T00:00:00Z"),
    });
    expect(rows).toEqual([]);
  });

  it("returns empty when no firstDueDate is provided", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 1000,
      installmentCount: 3,
      firstDueDate: null,
    });
    expect(rows).toEqual([]);
  });

  it("splits the remaining balance after initial payment", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 3000,
      initialPaymentUsd: 600,
      installmentCount: 3,
      firstDueDate: new Date("2026-07-01T00:00:00Z"),
    });
    expect(rows).toHaveLength(3);
    const sum = rows.reduce((acc, r) => acc + r.amountDue, 0);
    expect(Math.abs(sum - 2400)).toBeLessThan(0.001);
    expect(rows[0]!.dueDate.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("respects biweekly frequency", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 600,
      initialPaymentUsd: 0,
      installmentCount: 3,
      firstDueDate: new Date("2026-06-01T00:00:00Z"),
      frequency: "biweekly",
    });
    expect(rows[1]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(rows[2]!.dueDate.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("treats a missing initial payment as zero", () => {
    const rows = buildEnrollmentScheduleRows({
      totalAmountUsd: 900,
      installmentCount: 3,
      firstDueDate: new Date("2026-07-01T00:00:00Z"),
    });
    const sum = rows.reduce((acc, r) => acc + r.amountDue, 0);
    expect(Math.abs(sum - 900)).toBeLessThan(0.001);
  });
});
