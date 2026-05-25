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
