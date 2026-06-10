import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "./permissions";
import { getPermissionPreset, PERMISSION_PRESETS } from "./permission-presets";

describe("permission presets", () => {
  it("exposes practical presets for common Torre user types", () => {
    expect(PERMISSION_PRESETS.map((preset) => preset.id)).toEqual([
      "admin-total",
      "director-comercial",
      "closer-high-ticket",
      "setter",
      "solo-lectura",
      "operaciones-mentor",
    ]);
  });

  it("configures Admin total with all permissions and full data scope", () => {
    const preset = getPermissionPreset("admin-total");

    expect(preset).toMatchObject({
      label: "Admin total",
      role: "ADMIN",
      position: "ADMIN",
      dataScope: "ALL",
    });
    expect(preset.permissions).toEqual(ALL_PERMISSIONS);
  });

  it("configures High Ticket closers to edit dashboard data without user management", () => {
    const preset = getPermissionPreset("closer-high-ticket");

    expect(preset).toMatchObject({
      label: "Closer High Ticket",
      role: "OPERATOR",
      position: "CLOSER",
      dataScope: "OWN",
    });
    expect(preset.permissions).toContain("dashboard.read");
    expect(preset.permissions).toContain("dashboard.write");
    expect(preset.permissions).toContain("reports.read");
    expect(preset.permissions).not.toContain("users.create");
    expect(preset.permissions).not.toContain("users.update");
  });

  it("configures read-only users without write permissions", () => {
    const preset = getPermissionPreset("solo-lectura");

    expect(preset).toMatchObject({
      label: "Solo lectura",
      role: "VIEWER",
      position: "VIEWER",
      dataScope: "OWN",
    });
    expect(preset.permissions).toEqual(["dashboard.read", "reports.read", "operaciones.read"]);
  });
});
