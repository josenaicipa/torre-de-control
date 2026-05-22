import { describe, expect, it } from "vitest";
import {
  isMemberAllowed,
  resolveDashboardAccess,
  type DashboardActor,
} from "./dashboard-access";

function actor(overrides: Partial<DashboardActor>): DashboardActor {
  return {
    role: "VIEWER",
    permissions: ["dashboard.read", "dashboard.write"],
    position: "VIEWER",
    dataScope: "OWN",
    name: null,
    email: "someone@naicipa.com",
    ghlUserName: null,
    areaName: null,
    teamName: null,
    ...overrides,
  };
}

describe("resolveDashboardAccess — global access", () => {
  it("admins (by role) get global data regardless of stored scope", () => {
    const a = resolveDashboardAccess(actor({ role: "ADMIN", dataScope: "OWN" }));
    expect(a.isGlobalData).toBe(true);
    expect(a.canRead).toBe(true);
    expect(a.canWrite).toBe(true);
    expect(a.allowedMembers).toEqual([]);
  });

  it("admins (by position) get global data", () => {
    const a = resolveDashboardAccess(actor({ position: "ADMIN", permissions: [] }));
    expect(a.isGlobalData).toBe(true);
    // Admins implicitly read/write even with no stored permissions.
    expect(a.canRead).toBe(true);
    expect(a.canWrite).toBe(true);
  });

  it("DataScope ALL grants global data to non-admins", () => {
    const a = resolveDashboardAccess(actor({ position: "DIRECTOR", dataScope: "ALL" }));
    expect(a.isGlobalData).toBe(true);
    expect(a.reason).toBe("global");
  });
});

describe("resolveDashboardAccess — permissions", () => {
  it("requires dashboard.read for read and dashboard.write for write", () => {
    const readOnly = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Ventas", permissions: ["dashboard.read"] }),
    );
    expect(readOnly.canRead).toBe(true);
    expect(readOnly.canWrite).toBe(false);
  });

  it("denies read and write when no dashboard permissions are present", () => {
    const none = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Carlos Velez", permissions: [] }),
    );
    expect(none.canRead).toBe(false);
    expect(none.canWrite).toBe(false);
  });
});

describe("resolveDashboardAccess — CLOSER OWN", () => {
  it("matches by ghlUserName and returns all aliases of the collaborator", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Carlos Velez" }),
    );
    expect(a.isGlobalData).toBe(false);
    expect(a.allowedMembers).toEqual(["Carlos Velez", "Carlos"]);
    expect(a.reason).toBe("scoped-members");
  });

  it("matches by email local-part against the legacy id", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", email: "carlos@naicipa.com" }),
    );
    expect(a.allowedMembers).toEqual(["Carlos Velez", "Carlos"]);
  });

  it("matches by name for a closer without a legacy alias", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", name: "Juan Diego Afanador" }),
    );
    expect(a.allowedMembers).toEqual(["Juan Diego Afanador"]);
  });

  it("fails closed (no rows) when the identity matches no closer", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Nadie", email: "nadie@naicipa.com" }),
    );
    expect(a.allowedMembers).toEqual([]);
    expect(a.reason).toBe("no-rows");
  });

  it("does not match a marketing collaborator for a CLOSER", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Karen Anquiz" }),
    );
    expect(a.allowedMembers).toEqual([]);
  });

  it("gives no rows for a closer on a non-OWN scope", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "TEAM", ghlUserName: "Carlos Velez", teamName: "Closers" }),
    );
    expect(a.allowedMembers).toEqual([]);
  });
});

describe("resolveDashboardAccess — SETTER OWN", () => {
  it("matches Karen by email local-part", () => {
    const a = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", email: "karen@naicipa.com" }),
    );
    expect(a.allowedMembers).toEqual(["Karen", "Karen Anquiz"]);
  });

  it("matches Karen by display name", () => {
    const a = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", name: "Karen Anquiz" }),
    );
    expect(a.allowedMembers).toEqual(["Karen", "Karen Anquiz"]);
  });

  it("does not match a closer identity for a SETTER", () => {
    const a = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", ghlUserName: "Carlos Velez" }),
    );
    expect(a.allowedMembers).toEqual([]);
  });
});

describe("resolveDashboardAccess — DIRECTOR AREA/TEAM", () => {
  it("maps a Ventas area to all commercial collaborators", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Ventas" }),
    );
    expect(a.allowedMembers).toEqual([
      "Carlos Velez",
      "Carlos",
      "Daryi Uribe",
      "Daryi",
      "Juan Diego Afanador",
    ]);
  });

  it("maps a Closers team to commercial collaborators", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "TEAM", teamName: "Closers" }),
    );
    expect(a.allowedMembers).toContain("Carlos Velez");
    expect(a.allowedMembers).not.toContain("Karen");
  });

  it("maps a Marketing area to the marketing collaborator", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Marketing" }),
    );
    expect(a.allowedMembers).toEqual(["Karen", "Karen Anquiz"]);
  });

  it("fails closed for an unrecognized area name", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Operaciones" }),
    );
    expect(a.allowedMembers).toEqual([]);
    expect(a.reason).toBe("no-rows");
  });

  it("fails closed when an area name is ambiguous (matches both functions)", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Ventas y Marketing" }),
    );
    expect(a.allowedMembers).toEqual([]);
  });
});

describe("resolveDashboardAccess — fail-closed defaults", () => {
  it("gives a VIEWER no rows", () => {
    const a = resolveDashboardAccess(actor({ position: "VIEWER", dataScope: "OWN" }));
    expect(a.allowedMembers).toEqual([]);
    expect(a.isGlobalData).toBe(false);
  });
});

describe("isMemberAllowed", () => {
  it("allows any member for global users", () => {
    const a = resolveDashboardAccess(actor({ role: "ADMIN" }));
    expect(isMemberAllowed(a, "Karen")).toBe(true);
    expect(isMemberAllowed(a, "anything")).toBe(true);
  });

  it("allows only members in the scoped set", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Carlos Velez" }),
    );
    expect(isMemberAllowed(a, "Carlos")).toBe(true);
    expect(isMemberAllowed(a, "Carlos Velez")).toBe(true);
    expect(isMemberAllowed(a, "Karen")).toBe(false);
  });

  it("rejects non-string members", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Carlos Velez" }),
    );
    expect(isMemberAllowed(a, undefined)).toBe(false);
    expect(isMemberAllowed(a, 123)).toBe(false);
  });
});
