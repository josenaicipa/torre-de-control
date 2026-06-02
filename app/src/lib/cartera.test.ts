import { describe, it, expect } from "vitest";
import {
  installmentPending,
  isOutstanding,
  daysUntilDue,
  isInstallmentOverdue,
  classifyInstallment,
  compareCarteraPriority,
  compareCarteraBucket,
  summarizeCartera,
  type CarteraInstallment,
} from "./cartera";

const TODAY = new Date(Date.UTC(2026, 5, 2)); // 2026-06-02

function inst(overrides: Partial<CarteraInstallment> = {}): CarteraInstallment {
  return {
    studentId: "s1",
    amountDue: 100,
    amountPaid: 0,
    dueDate: new Date(Date.UTC(2026, 5, 2)),
    status: "PENDING",
    ...overrides,
  };
}

describe("installmentPending", () => {
  it("returns due minus paid, never negative", () => {
    expect(installmentPending({ amountDue: 100, amountPaid: 30 })).toBe(70);
    expect(installmentPending({ amountDue: 100, amountPaid: 120 })).toBe(0);
  });

  it("rounds to cents", () => {
    expect(installmentPending({ amountDue: 100.005, amountPaid: 0 })).toBe(100.01);
  });
});

describe("isOutstanding", () => {
  it("excludes PAID and WAIVED", () => {
    expect(isOutstanding(inst({ status: "PAID" }))).toBe(false);
    expect(isOutstanding(inst({ status: "WAIVED" }))).toBe(false);
  });

  it("excludes fully-paid installments even if status lags", () => {
    expect(isOutstanding(inst({ status: "PENDING", amountPaid: 100 }))).toBe(false);
  });

  it("includes pending and partial with remaining balance", () => {
    expect(isOutstanding(inst({ status: "PENDING" }))).toBe(true);
    expect(isOutstanding(inst({ status: "PARTIAL", amountPaid: 40 }))).toBe(true);
  });
});

describe("daysUntilDue", () => {
  it("is 0 when due today", () => {
    expect(daysUntilDue(new Date(Date.UTC(2026, 5, 2)), TODAY)).toBe(0);
  });

  it("is negative when overdue", () => {
    expect(daysUntilDue(new Date(Date.UTC(2026, 4, 28)), TODAY)).toBe(-5);
  });

  it("is positive for future dates", () => {
    expect(daysUntilDue(new Date(Date.UTC(2026, 5, 9)), TODAY)).toBe(7);
  });
});

describe("isInstallmentOverdue", () => {
  it("is true only when outstanding and past due", () => {
    expect(isInstallmentOverdue(inst({ dueDate: new Date(Date.UTC(2026, 4, 1)) }), TODAY)).toBe(true);
  });

  it("is false when due today", () => {
    expect(isInstallmentOverdue(inst(), TODAY)).toBe(false);
  });

  it("is false when settled", () => {
    expect(
      isInstallmentOverdue(inst({ dueDate: new Date(Date.UTC(2026, 4, 1)), status: "PAID", amountPaid: 100 }), TODAY),
    ).toBe(false);
  });
});

describe("classifyInstallment", () => {
  it("classifies overdue as vencida", () => {
    expect(classifyInstallment(inst({ dueDate: new Date(Date.UTC(2026, 4, 1)) }), TODAY)).toBe("vencida");
  });

  it("classifies today and within 7 days as proxima", () => {
    expect(classifyInstallment(inst(), TODAY)).toBe("proxima");
    expect(classifyInstallment(inst({ dueDate: new Date(Date.UTC(2026, 5, 9)) }), TODAY)).toBe("proxima");
  });

  it("classifies beyond 7 days as pendiente", () => {
    expect(classifyInstallment(inst({ dueDate: new Date(Date.UTC(2026, 5, 20)) }), TODAY)).toBe("pendiente");
  });

  it("returns null for settled installments", () => {
    expect(classifyInstallment(inst({ status: "WAIVED" }), TODAY)).toBeNull();
  });
});

describe("compareCarteraPriority", () => {
  it("orders vencidas before proximas before pendientes, then by due date", () => {
    const items = [
      inst({ dueDate: new Date(Date.UTC(2026, 5, 20)) }), // pendiente
      inst({ dueDate: new Date(Date.UTC(2026, 5, 4)) }), // proxima
      inst({ dueDate: new Date(Date.UTC(2026, 4, 1)) }), // vencida (más atrasada)
      inst({ dueDate: new Date(Date.UTC(2026, 4, 20)) }), // vencida
    ];
    const sorted = [...items].sort((a, b) => compareCarteraPriority(a, b, TODAY));
    expect(sorted.map((i) => i.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-05-01",
      "2026-05-20",
      "2026-06-04",
      "2026-06-20",
    ]);
  });
});

describe("compareCarteraBucket", () => {
  it("orders by precomputed bucket then due date", () => {
    const rows = [
      { bucket: "pendiente" as const, dueDate: new Date(Date.UTC(2026, 5, 20)) },
      { bucket: "proxima" as const, dueDate: new Date(Date.UTC(2026, 5, 4)) },
      { bucket: "vencida" as const, dueDate: new Date(Date.UTC(2026, 4, 1)) },
      { bucket: "vencida" as const, dueDate: new Date(Date.UTC(2026, 4, 20)) },
    ];
    const sorted = [...rows].sort((a, b) => compareCarteraBucket(a, b));
    expect(sorted.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-05-01",
      "2026-05-20",
      "2026-06-04",
      "2026-06-20",
    ]);
  });

  it("sends null bucket to the end", () => {
    const rows = [
      { bucket: null, dueDate: new Date(Date.UTC(2026, 4, 1)) },
      { bucket: "pendiente" as const, dueDate: new Date(Date.UTC(2026, 5, 20)) },
    ];
    const sorted = [...rows].sort((a, b) => compareCarteraBucket(a, b));
    expect(sorted.map((r) => r.bucket)).toEqual(["pendiente", null]);
  });
});

describe("summarizeCartera", () => {
  it("aggregates KPIs across installments", () => {
    const items = [
      inst({ studentId: "a", amountDue: 100, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 4, 1)) }), // vencida 100
      inst({ studentId: "a", amountDue: 50, amountPaid: 10, dueDate: new Date(Date.UTC(2026, 4, 20)) }), // vencida 40
      inst({ studentId: "b", amountDue: 80, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 5, 5)) }), // proxima 80
      inst({ studentId: "c", amountDue: 200, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 6, 1)) }), // pendiente 200
      inst({ studentId: "d", amountDue: 100, amountPaid: 100, status: "PAID", dueDate: new Date(Date.UTC(2026, 4, 1)) }), // saldada
    ];
    const kpis = summarizeCartera(items, TODAY);
    expect(kpis.totalPendingUsd).toBe(420);
    expect(kpis.totalOverdueUsd).toBe(140);
    expect(kpis.overdueCount).toBe(2);
    expect(kpis.dueSoonCount).toBe(1);
    expect(kpis.dueSoonUsd).toBe(80);
    expect(kpis.studentsInArrears).toBe(1);
  });

  it("returns zeros for empty input", () => {
    expect(summarizeCartera([], TODAY)).toEqual({
      totalPendingUsd: 0,
      totalOverdueUsd: 0,
      overdueCount: 0,
      dueSoonCount: 0,
      dueSoonUsd: 0,
      studentsInArrears: 0,
    });
  });
});
