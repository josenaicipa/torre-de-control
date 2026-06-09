import { describe, expect, it } from "vitest";
import {
  canReadDashboard,
  canWriteDashboard,
  isMemberAllowed,
  isOwnDashboardEntryMember,
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

  it("fails closed for empty-permission non-admin users", () => {
    const none = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Carlos Velez", permissions: [] }),
    );
    expect(none.canRead).toBe(false);
    expect(none.canWrite).toBe(false);
  });
});

describe("resolveDashboardAccess — MENTOR isolation", () => {
  it("denies commercial dashboard reads even with a legacy read permission", () => {
    const mentor = actor({ role: "MENTOR", position: "VIEWER", permissions: ["dashboard.read"] });
    expect(canReadDashboard(mentor)).toBe(false);
  });

  it("denies commercial dashboard writes even with a legacy write permission", () => {
    const mentor = actor({ role: "MENTOR", position: "VIEWER", permissions: ["dashboard.write"] });
    expect(canWriteDashboard(mentor)).toBe(false);
  });

  it("permits explicitly elevated MENTOR users with ADMIN position", () => {
    const mentorAdmin = actor({ role: "MENTOR", position: "ADMIN", permissions: [] });
    expect(canReadDashboard(mentorAdmin)).toBe(true);
    expect(canWriteDashboard(mentorAdmin)).toBe(true);
  });

  it("does not make a MENTOR readable when ALL remains stored as legacy scope", () => {
    const a = resolveDashboardAccess(
      actor({ role: "MENTOR", position: "VIEWER", dataScope: "ALL", permissions: ["dashboard.read"] }),
    );
    expect(a.canRead).toBe(false);
    expect(a.canWrite).toBe(false);
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

  it("matches by name for a closer with a legacy alias", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", name: "Wiston Quintero" }),
    );
    expect(a.allowedMembers).toEqual(["Wiston Quintero", "Juan Diego Afanador"]);
  });

  it("allows Daniel Garcia to own both setter and closer collaborator rows", () => {
    const setter = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", ghlUserName: "Daniel Garcia" }),
    );
    const closer = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Daniel Garcia" }),
    );

    expect(setter.allowedMembers).toEqual(["Daniel Garcia"]);
    expect(closer.allowedMembers).toEqual(["Daniel Garcia Closer", "Daniel Garcia"]);
  });

  it("allows Alejandro Gallo to own his closer collaborator row", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Alejandro Gallo" }),
    );

    expect(a.allowedMembers).toEqual(["Alejandro Gallo Closer", "Alejandro Gallo"]);
  });

  it("renames Daryi Uribe to Daryi Perez while preserving the Daryi legacy alias", () => {
    const a = resolveDashboardAccess(
      actor({ position: "CLOSER", dataScope: "OWN", ghlUserName: "Daryi Perez" }),
    );

    expect(a.allowedMembers).toEqual(["Daryi Perez", "Daryi"]);
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
  it("does not grant active setter ownership to inactive Karen Anquiz", () => {
    const byEmail = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", email: "karen@naicipa.com" }),
    );
    const byName = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", name: "Karen Anquiz" }),
    );

    expect(byEmail.allowedMembers).toEqual([]);
    expect(byEmail.reason).toBe("no-rows");
    expect(byName.allowedMembers).toEqual([]);
    expect(byName.reason).toBe("no-rows");
  });

  it("matches Luisa Vega as a setter", () => {
    const a = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", ghlUserName: "Luisa Vega" }),
    );

    expect(a.allowedMembers).toEqual(["Luisa Vega"]);
  });

  it("matches Lucas Soria as a setter", () => {
    const a = resolveDashboardAccess(
      actor({ position: "SETTER", dataScope: "OWN", ghlUserName: "Lucas Soria" }),
    );

    expect(a.allowedMembers).toEqual(["Lucas Soria"]);
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
      "Admin",
      "Valentina Sanchez",
      "Carlos Velez",
      "Carlos",
      "Daryi Perez",
      "Daryi",
      "Wiston Quintero",
      "Juan Diego Afanador",
      "Daniel Garcia Closer",
      "Daniel Garcia",
      "Alejandro Gallo Closer",
      "Alejandro Gallo",
    ]);
  });

  it("maps a Closers team to commercial collaborators", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "TEAM", teamName: "Closers" }),
    );
    expect(a.allowedMembers).toContain("Carlos Velez");
    expect(a.allowedMembers).not.toContain("Karen");
  });

  it("maps a Marketing area to every legacy Marketing tab member", () => {
    const a = resolveDashboardAccess(
      actor({ position: "DIRECTOR", dataScope: "AREA", areaName: "Marketing" }),
    );
    expect(a.allowedMembers).toEqual([
      "Karen",
      "Karen Anquiz",
      "Luisa",
      "Luisa Vega",
      "Valen",
      "Carlos",
      "Carlos Velez",
      "Dahiana",
      "Otro",
    ]);
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

describe("isOwnDashboardEntryMember", () => {
  it("keeps Karen's legacy marketing row available but not the inactive setter row", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Karen Anquiz" }), "Karen")).toBe(true);
    expect(isOwnDashboardEntryMember(actor({ email: "karen@naicipa.com" }), "Karen Anquiz")).toBe(true);
    expect(isOwnDashboardEntryMember(actor({ email: "karen@naicipa.com" }), "Karen Setter")).toBe(false);
  });

  it("allows legacy Marketing tab members to fill their short-name row", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Luisa Vega" }), "Luisa")).toBe(true);
    expect(isOwnDashboardEntryMember(actor({ name: "Carlos Velez" }), "Carlos")).toBe(true);
  });

  it("allows closer legacy aliases only for the matched closer", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Carlos Velez" }), "Carlos")).toBe(true);
    expect(isOwnDashboardEntryMember(actor({ name: "Carlos Velez" }), "Daryi")).toBe(false);
  });

  it("allows Alejandro Gallo to fill his closer row as his own daily entry", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Alejandro Gallo" }), "Alejandro Gallo Closer")).toBe(true);
  });

  it("allows Lucas Soria to fill his own setter daily entry", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Lucas Soria" }), "Lucas Soria")).toBe(true);
  });

  it("does not allow arbitrary users to fill another collaborator row", () => {
    expect(isOwnDashboardEntryMember(actor({ name: "Usuario Operador", email: "operador@naicipa.com" }), "Karen")).toBe(false);
  });
});
