import { describe, expect, it } from "vitest";
import { normalizeAreaForSelectedTeam } from "./user-scope-normalization";

describe("normalizeAreaForSelectedTeam", () => {
  it("keeps the selected area when no team is selected", () => {
    expect(normalizeAreaForSelectedTeam("area_ventas", null)).toBe("area_ventas");
  });

  it("uses the team area as source of truth when área/equipo are mismatched", () => {
    expect(normalizeAreaForSelectedTeam("area_setters", "area_ventas")).toBe("area_ventas");
  });

  it("infers the area when only team is selected", () => {
    expect(normalizeAreaForSelectedTeam(null, "area_operaciones")).toBe("area_operaciones");
  });
});
