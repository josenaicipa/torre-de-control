import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  summarizeStudents,
  compareStudentSummary,
  countStudentsByRisk,
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

describe("summarizeStudents", () => {
  it("groups installments per student and aggregates totals", () => {
    const items = [
      inst({ studentId: "a", amountDue: 100, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 4, 1)) }), // vencida 100, atraso 32
      inst({ studentId: "a", amountDue: 50, amountPaid: 10, dueDate: new Date(Date.UTC(2026, 5, 5)) }), // proxima 40
      inst({ studentId: "a", amountDue: 200, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 7, 1)) }), // futura 200
      inst({ studentId: "b", amountDue: 80, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 5, 4)) }), // proxima 80
      inst({ studentId: "c", amountDue: 300, amountPaid: 0, dueDate: new Date(Date.UTC(2026, 8, 1)) }), // futura 300
      inst({ studentId: "d", amountDue: 100, amountPaid: 100, status: "PAID", dueDate: new Date(Date.UTC(2026, 4, 1)) }), // saldada
    ];
    const summaries = summarizeStudents(items, TODAY);
    const byId = Object.fromEntries(summaries.map((s) => [s.studentId, s]));

    expect(summaries).toHaveLength(3); // d (saldada) no aparece

    expect(byId.a.riskLevel).toBe("en_mora");
    expect(byId.a.totalPendingUsd).toBe(340);
    expect(byId.a.totalOverdueUsd).toBe(100);
    expect(byId.a.overdueCount).toBe(1);
    expect(byId.a.upcomingCount).toBe(1);
    expect(byId.a.futureCount).toBe(1);
    expect(byId.a.outstandingCount).toBe(3);
    expect(byId.a.maxDaysOverdue).toBe(32);
    // próxima cuota = la más cercana en el futuro (2026-06-05), no la vencida
    expect(byId.a.nextDueDate?.toISOString().slice(0, 10)).toBe("2026-06-05");
    expect(byId.a.nextDueAmount).toBe(40);

    expect(byId.b.riskLevel).toBe("proximo");
    expect(byId.c.riskLevel).toBe("pendiente_futuro");
  });

  it("leaves nextDueDate null when all installments are overdue", () => {
    const items = [
      inst({ studentId: "a", dueDate: new Date(Date.UTC(2026, 4, 1)) }),
      inst({ studentId: "a", dueDate: new Date(Date.UTC(2026, 4, 20)) }),
    ];
    const [s] = summarizeStudents(items, TODAY);
    expect(s.nextDueDate).toBeNull();
    expect(s.nextDueAmount).toBe(0);
    expect(s.riskLevel).toBe("en_mora");
  });

  it("returns empty array for no outstanding installments", () => {
    expect(summarizeStudents([], TODAY)).toEqual([]);
  });
});

describe("compareStudentSummary", () => {
  it("orders en_mora before proximo before pendiente_futuro", () => {
    const items = [
      inst({ studentId: "future", amountDue: 200, dueDate: new Date(Date.UTC(2026, 7, 1)) }),
      inst({ studentId: "soon", amountDue: 80, dueDate: new Date(Date.UTC(2026, 5, 4)) }),
      inst({ studentId: "mora", amountDue: 100, dueDate: new Date(Date.UTC(2026, 4, 1)) }),
    ];
    const sorted = summarizeStudents(items, TODAY).sort(compareStudentSummary);
    expect(sorted.map((s) => s.studentId)).toEqual(["mora", "soon", "future"]);
  });

  it("within en_mora orders by overdue amount desc", () => {
    const items = [
      inst({ studentId: "small", amountDue: 50, dueDate: new Date(Date.UTC(2026, 4, 20)) }),
      inst({ studentId: "big", amountDue: 500, dueDate: new Date(Date.UTC(2026, 4, 25)) }),
    ];
    const sorted = summarizeStudents(items, TODAY).sort(compareStudentSummary);
    expect(sorted.map((s) => s.studentId)).toEqual(["big", "small"]);
  });
});

describe("botón Registrar pago / Ver pagos (contraste)", () => {
  // Guarda contra el pitfall conocido: estilos globales de a/visited pueden
  // sobrescribir text-white de Tailwind y dejar el texto azul sobre azul. Por
  // eso forzamos el color con `!` y desactivamos el subrayado de enlaces.
  const pageSource = readFileSync(
    fileURLToPath(new URL("../app/operaciones/cartera/page.tsx", import.meta.url)),
    "utf8",
  );

  it("fuerza texto blanco e ignora estilos de enlace en el botón primario azul", () => {
    expect(pageSource).toContain("bg-blue-600 !text-white");
    expect(pageSource).toContain("hover:!text-white");
    expect(pageSource).toContain("no-underline");
  });

  it("fuerza texto oscuro legible en el botón secundario blanco", () => {
    expect(pageSource).toContain("bg-white !text-slate-700");
    expect(pageSource).toContain("hover:!text-slate-900");
  });
});

describe("rendimiento del query de Cartera (regresión)", () => {
  // Guarda contra la regresión de performance: el query principal de la página
  // debe ser liviano (select de campos mínimos para KPIs), y los metadatos
  // pesados (nombre/mentor/closer) y el detalle de cuotas deben traerse solo
  // para los estudiantes visibles. Si alguien vuelve a meter un `include`
  // pesado en el query principal o quita el límite de render, esto debe romper.
  const pageSource = readFileSync(
    fileURLToPath(new URL("../app/operaciones/cartera/page.tsx", import.meta.url)),
    "utf8",
  );

  it("usa un select liviano (sin include) para el query principal de KPIs", () => {
    // El primer findMany no debe incluir relaciones; solo los campos del cálculo.
    const mainQuery = pageSource.slice(
      pageSource.indexOf("prisma.paymentSchedule.findMany"),
      pageSource.indexOf("const today"),
    );
    expect(mainQuery).toContain("select:");
    expect(mainQuery).not.toContain("include:");
    expect(mainQuery).not.toContain("mentorUser");
    expect(mainQuery).not.toContain("enrollment");
  });

  it("limita el render inicial a los primeros 50 por prioridad", () => {
    expect(pageSource).toContain("INITIAL_RENDER_LIMIT = 50");
    expect(pageSource).toContain("filteredSummaries.slice(0, INITIAL_RENDER_LIMIT)");
    expect(pageSource).toContain("Mostrando los primeros");
  });

  it("trae metadatos y detalle solo para los estudiantes visibles, con scope", () => {
    expect(pageSource).toContain("prisma.student.findMany");
    expect(pageSource).toContain("id: { in: visibleStudentIds }");
    expect(pageSource).toContain("studentId: { in: visibleStudentIds }");
    // El scope del actor se sigue aplicando en ambas consultas dependientes.
    expect(pageSource).toContain("...studentScopeFor(actor)");
  });
});

describe("countStudentsByRisk", () => {
  it("counts students per risk level", () => {
    const items = [
      inst({ studentId: "a", dueDate: new Date(Date.UTC(2026, 4, 1)) }), // mora
      inst({ studentId: "b", dueDate: new Date(Date.UTC(2026, 4, 1)) }), // mora
      inst({ studentId: "c", dueDate: new Date(Date.UTC(2026, 5, 4)) }), // proximo
      inst({ studentId: "d", dueDate: new Date(Date.UTC(2026, 8, 1)) }), // futuro
    ];
    const counts = countStudentsByRisk(summarizeStudents(items, TODAY));
    expect(counts).toEqual({
      total: 4,
      en_mora: 2,
      proximo: 1,
      pendiente_futuro: 1,
    });
  });
});
