import { describe, it, expect } from "vitest";
import {
  createStudentSchema,
  updateStudentSchema,
  listStudentsQuerySchema,
  createMentorSchema,
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

describe("createMentorSchema", () => {
  it("accepts valid input", () => {
    const result = createMentorSchema.safeParse({
      name: "Keiner",
      email: "keiner@unlockedacademy.co",
    });
    expect(result.success).toBe(true);
  });
  it("rejects empty name", () => {
    const result = createMentorSchema.safeParse({
      name: "",
      email: "k@e.com",
    });
    expect(result.success).toBe(false);
  });
});
