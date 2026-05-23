import { describe, it, expect } from "vitest";
import {
  studentScopeFor,
  canAccessStudent,
  mergeStudentScope,
  type ActorContext,
} from "./access";

const admin: ActorContext = { userId: "u1", role: "ADMIN", mentorId: null };
const operator: ActorContext = {
  userId: "u2",
  role: "OPERATOR",
  mentorId: null,
};
const viewer: ActorContext = { userId: "u3", role: "VIEWER", mentorId: null };
const mentorLinked: ActorContext = {
  userId: "u4",
  role: "MENTOR",
  mentorId: "mentor_keiner",
};
const mentorUnlinked: ActorContext = {
  userId: "u5",
  role: "MENTOR",
  mentorId: null,
};

describe("studentScopeFor", () => {
  it("returns empty filter for ADMIN", () => {
    expect(studentScopeFor(admin)).toEqual({});
  });
  it("returns empty filter for OPERATOR", () => {
    expect(studentScopeFor(operator)).toEqual({});
  });
  it("returns empty filter for VIEWER", () => {
    expect(studentScopeFor(viewer)).toEqual({});
  });
  it("returns mentorId filter for linked MENTOR", () => {
    expect(studentScopeFor(mentorLinked)).toEqual({ mentorId: "mentor_keiner" });
  });
  it("returns impossible filter for unlinked MENTOR (no exposure)", () => {
    expect(studentScopeFor(mentorUnlinked)).toEqual({ id: "__none__" });
  });
});

describe("canAccessStudent", () => {
  it("ADMIN can access any student", () => {
    expect(canAccessStudent(admin, "mentor_keiner")).toBe(true);
    expect(canAccessStudent(admin, null)).toBe(true);
  });
  it("OPERATOR can access any student", () => {
    expect(canAccessStudent(operator, "mentor_keiner")).toBe(true);
  });
  it("MENTOR can access own student", () => {
    expect(canAccessStudent(mentorLinked, "mentor_keiner")).toBe(true);
  });
  it("MENTOR cannot access foreign student", () => {
    expect(canAccessStudent(mentorLinked, "mentor_other")).toBe(false);
  });
  it("MENTOR cannot access student with no mentor assigned", () => {
    expect(canAccessStudent(mentorLinked, null)).toBe(false);
  });
  it("unlinked MENTOR cannot access anything", () => {
    expect(canAccessStudent(mentorUnlinked, "mentor_keiner")).toBe(false);
    expect(canAccessStudent(mentorUnlinked, null)).toBe(false);
  });
});

describe("mergeStudentScope", () => {
  it("merges extra filters with scope for non-mentor", () => {
    expect(mergeStudentScope(admin, { status: "ACTIVE" })).toEqual({
      status: "ACTIVE",
    });
  });
  it("scope overrides client-supplied mentorId for MENTOR", () => {
    const merged = mergeStudentScope(mentorLinked, {
      mentorId: "fake_id_from_client",
    });
    expect(merged).toEqual({ mentorId: "mentor_keiner" });
  });
  it("preserves other filters for MENTOR", () => {
    const merged = mergeStudentScope(mentorLinked, { status: "ACTIVE" });
    expect(merged).toEqual({ status: "ACTIVE", mentorId: "mentor_keiner" });
  });
});
