import { describe, it, expect } from "vitest";
import {
  studentScopeFor,
  canAccessStudent,
  mergeStudentScope,
  type ActorContext,
} from "./access";

const admin: ActorContext = { userId: "u1", role: "ADMIN", mentorUserId: null };
const operator: ActorContext = {
  userId: "u2",
  role: "OPERATOR",
  mentorUserId: null,
};
const viewer: ActorContext = { userId: "u3", role: "VIEWER", mentorUserId: null };
const mentorLinked: ActorContext = {
  userId: "u4",
  role: "MENTOR",
  mentorUserId: "u4",
};
const mentorUnlinked: ActorContext = {
  userId: "u5",
  role: "MENTOR",
  mentorUserId: null,
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
  it("returns mentorUserId filter for MENTOR", () => {
    expect(studentScopeFor(mentorLinked)).toEqual({ mentorUserId: "u4" });
  });
  it("returns impossible filter for unlinked MENTOR (no exposure)", () => {
    expect(studentScopeFor(mentorUnlinked)).toEqual({ id: "__none__" });
  });
});

describe("canAccessStudent", () => {
  it("ADMIN can access any student", () => {
    expect(canAccessStudent(admin, "u4")).toBe(true);
    expect(canAccessStudent(admin, null)).toBe(true);
  });
  it("OPERATOR can access any student", () => {
    expect(canAccessStudent(operator, "u4")).toBe(true);
  });
  it("MENTOR can access own student", () => {
    expect(canAccessStudent(mentorLinked, "u4")).toBe(true);
  });
  it("MENTOR cannot access foreign student", () => {
    expect(canAccessStudent(mentorLinked, "u_other")).toBe(false);
  });
  it("MENTOR cannot access student with no mentor assigned", () => {
    expect(canAccessStudent(mentorLinked, null)).toBe(false);
  });
  it("unlinked MENTOR cannot access anything", () => {
    expect(canAccessStudent(mentorUnlinked, "u4")).toBe(false);
    expect(canAccessStudent(mentorUnlinked, null)).toBe(false);
  });
});

describe("mergeStudentScope", () => {
  it("merges extra filters with scope for non-mentor", () => {
    expect(mergeStudentScope(admin, { status: "ACTIVE" })).toEqual({
      status: "ACTIVE",
    });
  });
  it("scope overrides client-supplied mentorUserId for MENTOR", () => {
    const merged = mergeStudentScope(mentorLinked, {
      mentorUserId: "fake_id_from_client",
    });
    expect(merged).toEqual({ mentorUserId: "u4" });
  });
  it("preserves other filters for MENTOR", () => {
    const merged = mergeStudentScope(mentorLinked, { status: "ACTIVE" });
    expect(merged).toEqual({ status: "ACTIVE", mentorUserId: "u4" });
  });
});
