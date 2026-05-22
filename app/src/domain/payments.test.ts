import { describe, it, expect } from "vitest";
import {
  computeSchedule,
  balanceForStudent,
  isOverdue,
  deriveScheduleStatus,
} from "./payments";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("computeSchedule", () => {
  it("splits 3000 USD into 3 monthly installments of 1000 each", () => {
    const result = computeSchedule({
      totalAmount: 3000,
      installments: 3,
      firstDueDate: new Date(Date.UTC(2026, 0, 1)),
      frequency: "monthly",
    });
    expect(result).toHaveLength(3);
    expect(result[0].amountDue).toBe(1000);
    expect(result[1].amountDue).toBe(1000);
    expect(result[2].amountDue).toBe(1000);
  });

  it("places remainder cents in last installment", () => {
    const result = computeSchedule({
      totalAmount: 1000,
      installments: 3,
      firstDueDate: new Date(Date.UTC(2026, 0, 1)),
      frequency: "monthly",
    });
    expect(result[0].amountDue).toBe(333.33);
    expect(result[1].amountDue).toBe(333.33);
    expect(result[2].amountDue).toBe(333.34);
    expect(
      round2(result[0].amountDue + result[1].amountDue + result[2].amountDue),
    ).toBe(1000);
  });

  it("schedules monthly due dates", () => {
    const result = computeSchedule({
      totalAmount: 3000,
      installments: 3,
      firstDueDate: new Date(Date.UTC(2026, 0, 1)),
      frequency: "monthly",
    });
    expect(result[0].dueDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result[1].dueDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(result[2].dueDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("schedules biweekly due dates (14-day steps)", () => {
    const result = computeSchedule({
      totalAmount: 400,
      installments: 2,
      firstDueDate: new Date(Date.UTC(2026, 0, 1)),
      frequency: "biweekly",
    });
    expect(result[0].dueDate.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result[1].dueDate.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("throws on zero installments", () => {
    expect(() =>
      computeSchedule({
        totalAmount: 1000,
        installments: 0,
        firstDueDate: new Date(),
        frequency: "monthly",
      }),
    ).toThrow();
  });

  it("throws on negative total", () => {
    expect(() =>
      computeSchedule({
        totalAmount: -500,
        installments: 3,
        firstDueDate: new Date(),
        frequency: "monthly",
      }),
    ).toThrow();
  });
});

describe("balanceForStudent", () => {
  it("sums pending amounts across schedules", () => {
    const bal = balanceForStudent([
      { amountDue: 1000, amountPaid: 1000 },
      { amountDue: 1000, amountPaid: 500 },
      { amountDue: 1000, amountPaid: 0 },
    ]);
    expect(bal).toBe(1500);
  });

  it("returns 0 when fully paid", () => {
    const bal = balanceForStudent([
      { amountDue: 1000, amountPaid: 1000 },
      { amountDue: 500, amountPaid: 500 },
    ]);
    expect(bal).toBe(0);
  });

  it("clamps overpayments at 0 contribution", () => {
    const bal = balanceForStudent([
      { amountDue: 1000, amountPaid: 1200 },
      { amountDue: 500, amountPaid: 0 },
    ]);
    expect(bal).toBe(500);
  });

  it("returns 0 on empty list", () => {
    expect(balanceForStudent([])).toBe(0);
  });
});

describe("isOverdue", () => {
  it("true when dueDate passed and unpaid", () => {
    expect(
      isOverdue(
        {
          dueDate: new Date(Date.UTC(2026, 0, 1)),
          status: "PENDING",
          amountDue: 1000,
          amountPaid: 0,
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe(true);
  });

  it("false when status is PAID even if dueDate passed", () => {
    expect(
      isOverdue(
        {
          dueDate: new Date(Date.UTC(2026, 0, 1)),
          status: "PAID",
          amountDue: 1000,
          amountPaid: 1000,
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe(false);
  });

  it("false when status is WAIVED", () => {
    expect(
      isOverdue(
        {
          dueDate: new Date(Date.UTC(2026, 0, 1)),
          status: "WAIVED",
          amountDue: 1000,
          amountPaid: 0,
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe(false);
  });

  it("false when not yet due", () => {
    expect(
      isOverdue(
        {
          dueDate: new Date(Date.UTC(2026, 1, 1)),
          status: "PENDING",
          amountDue: 1000,
          amountPaid: 0,
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe(false);
  });

  it("true when partial and overdue", () => {
    expect(
      isOverdue(
        {
          dueDate: new Date(Date.UTC(2026, 0, 1)),
          status: "PARTIAL",
          amountDue: 1000,
          amountPaid: 500,
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe(true);
  });
});

describe("deriveScheduleStatus", () => {
  it("PAID when fully covered", () => {
    expect(
      deriveScheduleStatus(
        {
          amountDue: 1000,
          amountPaid: 1000,
          dueDate: new Date(Date.UTC(2026, 0, 1)),
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe("PAID");
  });

  it("PARTIAL when some paid and not yet due", () => {
    expect(
      deriveScheduleStatus(
        {
          amountDue: 1000,
          amountPaid: 500,
          dueDate: new Date(Date.UTC(2026, 1, 1)),
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe("PARTIAL");
  });

  it("OVERDUE when partial and dueDate passed", () => {
    expect(
      deriveScheduleStatus(
        {
          amountDue: 1000,
          amountPaid: 500,
          dueDate: new Date(Date.UTC(2026, 0, 1)),
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe("OVERDUE");
  });

  it("PENDING when nothing paid and not yet due", () => {
    expect(
      deriveScheduleStatus(
        {
          amountDue: 1000,
          amountPaid: 0,
          dueDate: new Date(Date.UTC(2026, 1, 1)),
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe("PENDING");
  });

  it("OVERDUE when nothing paid and dueDate passed", () => {
    expect(
      deriveScheduleStatus(
        {
          amountDue: 1000,
          amountPaid: 0,
          dueDate: new Date(Date.UTC(2026, 0, 1)),
        },
        new Date(Date.UTC(2026, 0, 15)),
      ),
    ).toBe("OVERDUE");
  });
});
