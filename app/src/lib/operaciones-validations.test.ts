import { describe, it, expect } from "vitest";
import {
  addInstallmentSchema,
  createPaymentSchema,
  createProgressUpdateSchema,
  createScheduleSchema,
  createStudentSchema,
  updateStudentSchema,
  updatePaymentSchema,
  updateScheduleSchema,
  listStudentsQuerySchema,
  upsertMonthlyMetricsSchema,
  createProductSchema,
  updateProductSchema,
  createPaymentAccountSchema,
  updatePaymentAccountSchema,
  createStudentTagSchema,
  updateStudentTagSchema,
  createEnrollmentBaseSchema,
  referralSplitListSchema,
} from "./operaciones-validations";

describe("createStudentSchema", () => {
  it("accepts valid input", () => {
    const result = createStudentSchema.safeParse({
      fullName: "Juan Pérez",
      email: "juan@example.com",
      startDate: "2026-05-23",
      durationMonths: 12,
    });
    expect(result.success).toBe(true);
  });

  it("trims fullName", () => {
    const result = createStudentSchema.parse({
      fullName: "  Juan  ",
      email: "juan@example.com",
      startDate: "2026-05-23",
      durationMonths: 12,
    });
    expect(result.fullName).toBe("Juan");
  });

  it("lowercases email", () => {
    const result = createStudentSchema.parse({
      fullName: "Juan",
      email: "Juan@EXAMPLE.com",
      startDate: "2026-05-23",
      durationMonths: 12,
    });
    expect(result.email).toBe("juan@example.com");
  });

  it("rejects invalid email", () => {
    const result = createStudentSchema.safeParse({
      fullName: "Juan",
      email: "not-an-email",
      startDate: "2026-05-23",
      durationMonths: 12,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createStudentSchema.safeParse({
      fullName: "Juan",
      email: "j@e.com",
      startDate: "23/05/2026",
      durationMonths: 12,
    });
    expect(result.success).toBe(false);
  });

  it("rejects durationMonths <= 0", () => {
    const result = createStudentSchema.safeParse({
      fullName: "Juan",
      email: "j@e.com",
      startDate: "2026-05-23",
      durationMonths: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects durationMonths > 60", () => {
    const result = createStudentSchema.safeParse({
      fullName: "Juan",
      email: "j@e.com",
      startDate: "2026-05-23",
      durationMonths: 72,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentSchema", () => {
  it("allows partial updates", () => {
    const result = updateStudentSchema.safeParse({ fullName: "Nuevo Nombre" });
    expect(result.success).toBe(true);
  });
  it("allows status update only", () => {
    const result = updateStudentSchema.safeParse({ status: "COMPLETED" });
    expect(result.success).toBe(true);
  });
  it("rejects invalid status", () => {
    const result = updateStudentSchema.safeParse({ status: "WRONG" as never });
    expect(result.success).toBe(false);
  });
});

describe("listStudentsQuerySchema", () => {
  it("applies defaults for page and pageSize", () => {
    const result = listStudentsQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });
  it("coerces string numbers from query string", () => {
    const result = listStudentsQuerySchema.parse({
      page: "3",
      pageSize: "25",
    });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(25);
  });
  it("clamps pageSize to max 200", () => {
    const result = listStudentsQuerySchema.safeParse({ pageSize: "500" });
    expect(result.success).toBe(false);
  });
});

describe("createScheduleSchema", () => {
  it("applies currency and frequency defaults", () => {
    const parsed = createScheduleSchema.parse({
      totalAmount: 3000,
      installments: 3,
      firstDueDate: "2026-06-01",
    });
    expect(parsed.currency).toBe("USD");
    expect(parsed.frequency).toBe("monthly");
    expect(parsed.replaceExisting).toBe(false);
  });

  it("rejects more than 24 installments", () => {
    expect(
      createScheduleSchema.safeParse({
        totalAmount: 3000,
        installments: 25,
        firstDueDate: "2026-06-01",
      }).success,
    ).toBe(false);
  });
});

describe("createPaymentSchema", () => {
  it("accepts an optional schedule association", () => {
    expect(
      createPaymentSchema.safeParse({
        amount: 500,
        paidAt: "2026-06-01",
        scheduleId: "cmav9cy3g000008l22t123456",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-positive payment", () => {
    expect(
      createPaymentSchema.safeParse({
        amount: 0,
        paidAt: "2026-06-01",
      }).success,
    ).toBe(false);
  });
});

describe("addInstallmentSchema", () => {
  it("accepts a new installment with inherited currency", () => {
    expect(
      addInstallmentSchema.safeParse({
        amountDue: 250,
        dueDate: "2026-07-01",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid due date", () => {
    expect(
      addInstallmentSchema.safeParse({
        amountDue: 250,
        dueDate: "01/07/2026",
      }).success,
    ).toBe(false);
  });
});

describe("createProgressUpdateSchema", () => {
  it("accepts a valid progress update", () => {
    expect(
      createProgressUpdateSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-15",
        progressLevel: "MEDIO",
        notes: "Se validaron los siguientes pasos.",
        rating: 4,
        monthlyRevenue: 500,
        monthlyRevenueCurrency: "USD",
        monthlyOrders: 3,
      }).success,
    ).toBe(true);
  });

  it("rejects empty notes and out-of-range rating", () => {
    expect(
      createProgressUpdateSchema.safeParse({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-15",
        progressLevel: "MEDIO",
        notes: " ",
        rating: 6,
      }).success,
    ).toBe(false);
  });
});

describe("updatePaymentSchema", () => {
  it("allows moving a payment back to standalone", () => {
    expect(updatePaymentSchema.safeParse({ scheduleId: null }).success).toBe(true);
  });

  it("rejects a non-positive corrected amount", () => {
    expect(updatePaymentSchema.safeParse({ amount: 0 }).success).toBe(false);
  });
});

describe("updateScheduleSchema", () => {
  it("accepts edited installment fields", () => {
    expect(
      updateScheduleSchema.safeParse({
        amountDue: 900,
        currency: "USD",
        dueDate: "2026-06-30",
      }).success,
    ).toBe(true);
  });
});

describe("upsertMonthlyMetricsSchema", () => {
  it("defaults monthly metric currency to COP", () => {
    const metric = upsertMonthlyMetricsSchema.parse({
      year: 2026,
      month: 5,
      revenue: 1500000,
      orders: 20,
    });
    expect(metric.currency).toBe("COP");
  });

  it("rejects invalid month and negative metric values", () => {
    expect(
      upsertMonthlyMetricsSchema.safeParse({
        year: 2026,
        month: 13,
        revenue: -1,
        orders: -1,
      }).success,
    ).toBe(false);
  });
});

// ───────── Products architecture (PR1) ─────────

describe("createProductSchema", () => {
  it("applies sensible defaults for booleans and saleLimit", () => {
    const parsed = createProductSchema.parse({
      name: "Mentoría Principal",
      slug: "mentoria-principal",
      basePriceUsd: 2500,
    });
    expect(parsed.saleLimit).toBe("ONE_PER_STUDENT");
    expect(parsed.allowsInstallments).toBe(true);
    expect(parsed.requiresInitialPayment).toBe(false);
    expect(parsed.generatesCommission).toBe(false);
    expect(parsed.defaultCommissionPercent).toBe(0);
    expect(parsed.isMainProduct).toBe(false);
    expect(parsed.isActive).toBe(true);
    expect(parsed.currency).toBe("USD");
  });

  it("rejects an invalid slug", () => {
    expect(
      createProductSchema.safeParse({
        name: "X",
        slug: "Has Spaces",
        basePriceUsd: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects defaultCommissionPercent out of 0-100", () => {
    expect(
      createProductSchema.safeParse({
        name: "X",
        slug: "x",
        basePriceUsd: 100,
        defaultCommissionPercent: 120,
      }).success,
    ).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("allows toggling a single flag", () => {
    expect(updateProductSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateProductSchema.safeParse({ isMainProduct: true }).success).toBe(true);
  });
});

describe("createPaymentAccountSchema", () => {
  const validOwnerId = "cmav9cy3g000008l22towner1";
  const validProviderId = "cmav9cy3g000008l22tprov1";

  it("requires controlled owner + provider and defaults to USD/active", () => {
    const parsed = createPaymentAccountSchema.parse({
      displayName: "Stripe US",
      ownerUserId: validOwnerId,
      paymentProviderId: validProviderId,
    });
    expect(parsed.currency).toBe("USD");
    expect(parsed.isActive).toBe(true);
    expect(parsed.ownerUserId).toBe(validOwnerId);
    expect(parsed.paymentProviderId).toBe(validProviderId);
  });

  it("rejects missing ownerUserId and/or paymentProviderId", () => {
    expect(
      createPaymentAccountSchema.safeParse({ displayName: "Stripe US" }).success,
    ).toBe(false);
    expect(
      createPaymentAccountSchema.safeParse({
        displayName: "Stripe US",
        ownerUserId: validOwnerId,
      }).success,
    ).toBe(false);
  });

  it("rejects missing displayName even with owner/provider set", () => {
    expect(
      createPaymentAccountSchema.safeParse({
        ownerUserId: validOwnerId,
        paymentProviderId: validProviderId,
      }).success,
    ).toBe(false);
  });

  it("accepts non-CUID owner and provider ids (legacy/manual seeds)", () => {
    const parsed = createPaymentAccountSchema.parse({
      displayName: "Cuenta Banco Local",
      ownerUserId: "user_legacy_123",
      paymentProviderId: "provider-banco-1",
    });
    expect(parsed.ownerUserId).toBe("user_legacy_123");
    expect(parsed.paymentProviderId).toBe("provider-banco-1");
  });

  it("rejects empty ownerUserId/paymentProviderId with required messages", () => {
    const result = createPaymentAccountSchema.safeParse({
      displayName: "Cuenta X",
      ownerUserId: "",
      paymentProviderId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Titular requerido");
      expect(messages).toContain("Proveedor requerido");
    }
  });
});

describe("updatePaymentAccountSchema", () => {
  it("allows a partial update", () => {
    expect(updatePaymentAccountSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("rejects empty ownerUserId/paymentProviderId with required messages", () => {
    const result = updatePaymentAccountSchema.safeParse({
      ownerUserId: "",
      paymentProviderId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Titular requerido");
      expect(messages).toContain("Proveedor requerido");
    }
  });
});

describe("createStudentTagSchema", () => {
  it("defaults isAutomatic, allowAutomaticAssignment to false and isActive to true", () => {
    const parsed = createStudentTagSchema.parse({
      name: "VIP",
      slug: "vip",
    });
    expect(parsed.isAutomatic).toBe(false);
    expect(parsed.allowAutomaticAssignment).toBe(false);
    expect(parsed.isActive).toBe(true);
  });

  it("accepts a hex color and rejects invalid colors", () => {
    expect(
      createStudentTagSchema.safeParse({
        name: "VIP",
        slug: "vip",
        color: "#aabbcc",
      }).success,
    ).toBe(true);
    expect(
      createStudentTagSchema.safeParse({
        name: "VIP",
        slug: "vip",
        color: "red",
      }).success,
    ).toBe(false);
  });

  it("does not couple allowAutomaticAssignment to isAutomatic", () => {
    const parsed = createStudentTagSchema.parse({
      name: "Auto-pausados",
      slug: "auto-pausados",
      isAutomatic: true,
      allowAutomaticAssignment: true,
    });
    expect(parsed.isAutomatic).toBe(true);
    expect(parsed.allowAutomaticAssignment).toBe(true);
  });
});

describe("updateStudentTagSchema", () => {
  it("allows isolated toggles", () => {
    expect(updateStudentTagSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(
      updateStudentTagSchema.safeParse({ allowAutomaticAssignment: true }).success,
    ).toBe(true);
  });
});

describe("createEnrollmentBaseSchema", () => {
  it("requires studentId, productId, startedAt and totalAmountUsd", () => {
    const valid = createEnrollmentBaseSchema.safeParse({
      studentId: "cmav9cy3g000008l22t111111",
      productId: "cmav9cy3g000008l22t222222",
      startedAt: "2026-06-01",
      totalAmountUsd: 3000,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects totalAmountUsd out of bounds", () => {
    expect(
      createEnrollmentBaseSchema.safeParse({
        studentId: "cmav9cy3g000008l22t111111",
        productId: "cmav9cy3g000008l22t222222",
        startedAt: "2026-06-01",
        totalAmountUsd: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects installmentCount above 24", () => {
    expect(
      createEnrollmentBaseSchema.safeParse({
        studentId: "cmav9cy3g000008l22t111111",
        productId: "cmav9cy3g000008l22t222222",
        startedAt: "2026-06-01",
        totalAmountUsd: 3000,
        installmentCount: 25,
      }).success,
    ).toBe(false);
  });

  it("rejects commissionPercent out of 0-100", () => {
    expect(
      createEnrollmentBaseSchema.safeParse({
        studentId: "cmav9cy3g000008l22t111111",
        productId: "cmav9cy3g000008l22t222222",
        startedAt: "2026-06-01",
        totalAmountUsd: 3000,
        commissionPercent: 110,
      }).success,
    ).toBe(false);
  });
});

describe("referralSplitListSchema", () => {
  it("accepts an empty split list", () => {
    expect(referralSplitListSchema.safeParse([]).success).toBe(true);
  });

  it("accepts splits that sum to 100", () => {
    expect(
      referralSplitListSchema.safeParse([
        {
          referralId: "cmav9cy3g000008l22tref0001",
          splitPercent: 60,
          commissionBaseUsd: 600,
        },
        {
          referralId: "cmav9cy3g000008l22tref0002",
          splitPercent: 40,
          commissionBaseUsd: 400,
        },
      ]).success,
    ).toBe(true);
  });

  it("rejects splits that do not sum to 100", () => {
    expect(
      referralSplitListSchema.safeParse([
        {
          referralId: "cmav9cy3g000008l22tref0001",
          splitPercent: 70,
          commissionBaseUsd: 700,
        },
      ]).success,
    ).toBe(false);
  });
});
