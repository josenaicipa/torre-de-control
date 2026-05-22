import { describe, expect, it } from "vitest";
import {
  CLOSER_MATCH_FIELDS,
  SETTER_MATCH_FIELDS,
  grantsData,
  resolveDataScope,
  type ScopeUser,
} from "./data-scope";

function user(overrides: Partial<ScopeUser>): ScopeUser {
  return {
    position: "VIEWER",
    dataScope: "OWN",
    areaId: null,
    teamId: null,
    ghlUserId: null,
    ...overrides,
  };
}

describe("resolveDataScope", () => {
  it("gives Admin every record regardless of stored scope", () => {
    const filter = resolveDataScope(user({ position: "ADMIN", dataScope: "OWN" }));
    expect(filter).toEqual({ kind: "all" });
  });

  it("gives ALL scope every record for non-admins", () => {
    const filter = resolveDataScope(user({ position: "DIRECTOR", dataScope: "ALL" }));
    expect(filter).toEqual({ kind: "all" });
  });

  it("scopes Director/AREA to the user's areaId", () => {
    const filter = resolveDataScope(
      user({ position: "DIRECTOR", dataScope: "AREA", areaId: "area-1" }),
    );
    expect(filter).toEqual({ kind: "area", areaId: "area-1" });
  });

  it("fails closed when AREA scope has no areaId", () => {
    const filter = resolveDataScope(user({ position: "DIRECTOR", dataScope: "AREA", areaId: null }));
    expect(filter.kind).toBe("none");
    expect(grantsData(filter)).toBe(false);
  });

  it("scopes Director/TEAM to the user's teamId", () => {
    const filter = resolveDataScope(
      user({ position: "DIRECTOR", dataScope: "TEAM", teamId: "team-9" }),
    );
    expect(filter).toEqual({ kind: "team", teamId: "team-9" });
  });

  it("fails closed when TEAM scope has no teamId", () => {
    const filter = resolveDataScope(user({ position: "DIRECTOR", dataScope: "TEAM", teamId: "" }));
    expect(filter.kind).toBe("none");
  });

  it("scopes Closer/OWN to closer GHL attribution fields", () => {
    const filter = resolveDataScope(
      user({ position: "CLOSER", dataScope: "OWN", ghlUserId: "ghl-closer-1" }),
    );
    expect(filter).toEqual({
      kind: "own",
      attribution: "closer",
      ghlUserId: "ghl-closer-1",
      matchFields: CLOSER_MATCH_FIELDS,
    });
  });

  it("scopes Setter/OWN to setter GHL attribution fields", () => {
    const filter = resolveDataScope(
      user({ position: "SETTER", dataScope: "OWN", ghlUserId: "ghl-setter-1" }),
    );
    expect(filter).toEqual({
      kind: "own",
      attribution: "setter",
      ghlUserId: "ghl-setter-1",
      matchFields: SETTER_MATCH_FIELDS,
    });
  });

  it("fails closed for a Closer on OWN scope with no ghlUserId", () => {
    const filter = resolveDataScope(user({ position: "CLOSER", dataScope: "OWN", ghlUserId: null }));
    expect(filter).toEqual({ kind: "none", reason: "closer-own-missing-ghl" });
    expect(grantsData(filter)).toBe(false);
  });

  it("fails closed for a Setter on OWN scope with no ghlUserId", () => {
    const filter = resolveDataScope(user({ position: "SETTER", dataScope: "OWN", ghlUserId: "  " }));
    expect(filter).toEqual({ kind: "none", reason: "setter-own-missing-ghl" });
  });

  it("fails closed for a Viewer on OWN scope with no ghlUserId", () => {
    const filter = resolveDataScope(user({ position: "VIEWER", dataScope: "OWN", ghlUserId: null }));
    expect(filter).toEqual({ kind: "none", reason: "own-scope-missing-ghl" });
  });

  it("treats CUSTOM scope as deny until configured", () => {
    const filter = resolveDataScope(user({ position: "DIRECTOR", dataScope: "CUSTOM" }));
    expect(filter).toEqual({ kind: "none", reason: "custom-scope-not-configured" });
  });

  it("trims whitespace-only ids before deciding scope", () => {
    const filter = resolveDataScope(user({ position: "DIRECTOR", dataScope: "AREA", areaId: "   " }));
    expect(filter.kind).toBe("none");
  });
});
