import { describe, expect, it } from "vitest";
import {
  closerMatchesUser,
  ImportBatchNotFoundError,
  ImportBatchSourceError,
  parseCarteraCsv,
  resolveCloserUserId,
  revertCarteraBatch,
  scheduleStatusFor,
  type CloserCandidate,
} from "./legacy-cartera-import";

const closers: CloserCandidate[] = [
  { id: "u1", name: "Alejandro Gallo", email: "alejandro@x.co" },
  { id: "u2", name: "Valentina Pérez", email: "valentina@x.co" },
];

describe("closerMatchesUser", () => {
  it("matches by first name ignoring accents/case", () => {
    expect(closerMatchesUser("alejandro", closers[0])).toBe(true);
    expect(closerMatchesUser("VALENTINA", closers[1])).toBe(true);
  });

  it("matches by email prefix", () => {
    expect(closerMatchesUser("valentina", closers[1])).toBe(true);
  });

  it("does not match a different name", () => {
    expect(closerMatchesUser("carlos", closers[0])).toBe(false);
  });

  it("returns false for empty closer", () => {
    expect(closerMatchesUser("", closers[0])).toBe(false);
  });
});

describe("resolveCloserUserId", () => {
  it("resolves the matching user id", () => {
    expect(resolveCloserUserId("Alejandro", closers)).toBe("u1");
    expect(resolveCloserUserId("Valentina", closers)).toBe("u2");
  });

  it("returns null when there is no match", () => {
    expect(resolveCloserUserId("Desconocido", closers)).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(resolveCloserUserId(null, closers)).toBeNull();
    expect(resolveCloserUserId(undefined, closers)).toBeNull();
  });
});

describe("scheduleStatusFor", () => {
  const today = new Date(Date.UTC(2026, 0, 15));
  const base = {
    installmentNumber: 1,
    dueDate: null,
    method: null,
    received: false,
  };

  it("is PAID when fully paid", () => {
    const status = scheduleStatusFor(
      { ...base, amountDue: 100, amountPaid: 100, paidAt: null, received: true },
      new Date(Date.UTC(2026, 0, 1)),
      today,
    );
    expect(status).toBe("PAID");
  });

  it("is PARTIAL when partially paid", () => {
    const status = scheduleStatusFor(
      { ...base, amountDue: 100, amountPaid: 40, paidAt: null },
      new Date(Date.UTC(2026, 0, 1)),
      today,
    );
    expect(status).toBe("PARTIAL");
  });

  it("is OVERDUE when unpaid and past due", () => {
    const status = scheduleStatusFor(
      { ...base, amountDue: 100, amountPaid: 0, paidAt: null },
      new Date(Date.UTC(2026, 0, 1)),
      today,
    );
    expect(status).toBe("OVERDUE");
  });

  it("is PENDING when unpaid and not yet due", () => {
    const status = scheduleStatusFor(
      { ...base, amountDue: 100, amountPaid: 0, paidAt: null },
      new Date(Date.UTC(2026, 1, 1)),
      today,
    );
    expect(status).toBe("PENDING");
  });
});

describe("parseCarteraCsv", () => {
  it("skips the 4 header lines and parses data rows", () => {
    // The legacy export carries 4 header lines before data (from_line: 5).
    const header = ["h1", "h2", "h3", "h4"].join("\n");
    const dataRow =
      "Juan Perez,3001234567,juan@x.co,Alejandro,08/08/24,$500,Transferencia,TRUE";
    const csv = `${header}\n${dataRow}\n`;
    const { parsedRows, errors } = parseCarteraCsv(csv);
    expect(errors).toHaveLength(0);
    expect(parsedRows).toHaveLength(1);
    expect(parsedRows[0].head.fullName).toBe("Juan Perez");
    expect(parsedRows[0].head.email).toBe("juan@x.co");
    expect(parsedRows[0].legacyRowId).toBe(5);
  });

  it("ignores blank-name rows", () => {
    const csv = ["h1", "h2", "h3", "h4", ",,,", ""].join("\n");
    const { parsedRows } = parseCarteraCsv(csv);
    expect(parsedRows).toHaveLength(0);
  });
});

// In-memory fake of the Prisma transaction client used by revertCarteraBatch.
// Mutates its own arrays so tests can assert exactly what survived the revert.
interface FakeState {
  batches: Array<{ id: string; source: string; filename: string }>;
  students: Array<{ id: string; importBatchId: string | null }>;
  members: Array<{ id: string; studentId: string }>;
  schedules: Array<{ id: string; studentId: string }>;
  payments: Array<{ id: string; studentId: string }>;
  attributions: Array<{ id: string; studentId: string }>;
}

function makeFakeTx(state: FakeState) {
  const deleteByStudent = (
    rows: Array<{ studentId: string }>,
    ids: string[],
  ) => {
    const keep = rows.filter((row) => !ids.includes(row.studentId));
    const count = rows.length - keep.length;
    rows.length = 0;
    rows.push(...keep);
    return { count };
  };

  return {
    importBatch: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.batches.find((batch) => batch.id === where.id) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        state.batches = state.batches.filter((batch) => batch.id !== where.id);
        return {};
      },
    },
    student: {
      findMany: async ({ where }: { where: { importBatchId: string } }) =>
        state.students
          .filter((student) => student.importBatchId === where.importBatchId)
          .map((student) => ({ id: student.id })),
      deleteMany: async ({ where }: { where: { importBatchId: string } }) => {
        const keep = state.students.filter(
          (student) => student.importBatchId !== where.importBatchId,
        );
        const count = state.students.length - keep.length;
        state.students = keep;
        return { count };
      },
    },
    payment: {
      deleteMany: async ({ where }: { where: { studentId: { in: string[] } } }) =>
        deleteByStudent(state.payments, where.studentId.in),
    },
    paymentSchedule: {
      deleteMany: async ({ where }: { where: { studentId: { in: string[] } } }) =>
        deleteByStudent(state.schedules, where.studentId.in),
    },
    saleAttribution: {
      deleteMany: async ({ where }: { where: { studentId: { in: string[] } } }) =>
        deleteByStudent(state.attributions, where.studentId.in),
    },
    studentMember: {
      deleteMany: async ({ where }: { where: { studentId: { in: string[] } } }) =>
        deleteByStudent(state.members, where.studentId.in),
    },
  };
}

type RevertTx = Parameters<typeof revertCarteraBatch>[0];

describe("revertCarteraBatch", () => {
  function seedState(): FakeState {
    return {
      batches: [
        { id: "b1", source: "cartera_legacy", filename: "lote1.csv" },
        { id: "b2", source: "cartera_legacy", filename: "lote2.csv" },
      ],
      students: [
        { id: "s1", importBatchId: "b1" },
        { id: "s2", importBatchId: "b1" },
        { id: "s3", importBatchId: "b2" },
        { id: "s4", importBatchId: null }, // creado a mano, sin lote
      ],
      members: [
        { id: "m1", studentId: "s1" },
        { id: "m2", studentId: "s3" },
      ],
      schedules: [
        { id: "sch1", studentId: "s1" },
        { id: "sch2", studentId: "s3" },
      ],
      payments: [
        { id: "p1", studentId: "s2" },
        { id: "p2", studentId: "s3" },
      ],
      attributions: [
        { id: "a1", studentId: "s1" },
        { id: "a2", studentId: "s3" },
      ],
    };
  }

  it("deletes only students of the target batch and their data, leaving others intact", async () => {
    const state = seedState();
    const tx = makeFakeTx(state) as unknown as RevertTx;

    const result = await revertCarteraBatch(tx, "b1");

    expect(result.studentsDeleted).toBe(2);
    expect(result.membersDeleted).toBe(1);
    expect(result.schedulesDeleted).toBe(1);
    expect(result.paymentsDeleted).toBe(1);
    expect(result.attributionsDeleted).toBe(1);

    // Students of b2 and the manual one survive.
    expect(state.students.map((s) => s.id).sort()).toEqual(["s3", "s4"]);
    // Related data of the untouched students survives.
    expect(state.members.map((m) => m.id)).toEqual(["m2"]);
    expect(state.schedules.map((s) => s.id)).toEqual(["sch2"]);
    expect(state.payments.map((p) => p.id)).toEqual(["p2"]);
    expect(state.attributions.map((a) => a.id)).toEqual(["a2"]);
    // The reverted batch is gone; b2 remains.
    expect(state.batches.map((b) => b.id)).toEqual(["b2"]);
  });

  it("throws when the batch does not exist", async () => {
    const state = seedState();
    const tx = makeFakeTx(state) as unknown as RevertTx;
    await expect(revertCarteraBatch(tx, "nope")).rejects.toBeInstanceOf(
      ImportBatchNotFoundError,
    );
  });

  it("refuses to revert a batch whose source is not cartera_legacy", async () => {
    const state = seedState();
    state.batches.push({ id: "b3", source: "dropi", filename: "x.csv" });
    const tx = makeFakeTx(state) as unknown as RevertTx;
    await expect(revertCarteraBatch(tx, "b3")).rejects.toBeInstanceOf(
      ImportBatchSourceError,
    );
    // Nothing was deleted.
    expect(state.students).toHaveLength(4);
  });
});
