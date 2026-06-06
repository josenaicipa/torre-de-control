import { describe, expect, it } from "vitest";
import {
  closerMatchesUser,
  parseCarteraCsv,
  resolveCloserUserId,
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
