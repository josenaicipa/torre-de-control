import { describe, expect, it } from "vitest";
import { summarizeEffectiveAccess } from "./effective-access-summary";

describe("effective access summary", () => {
  it("summarizes a full admin in practical language", () => {
    const summary = summarizeEffectiveAccess({
      role: "ADMIN",
      position: "ADMIN",
      dataScope: "ALL",
      permissions: [],
      areaName: null,
      teamName: null,
      managerName: null,
    });

    expect(summary.badges).toEqual(["Admin total", "Puede editar reportes", "Puede administrar usuarios"]);
    expect(summary.scopeLabel).toBe("Todo el dashboard");
    expect(summary.description).toBe("Puede administrar usuarios, permisos y datos de todo el dashboard.");
  });

  it("summarizes an own-scope closer with dashboard write but no user management", () => {
    const summary = summarizeEffectiveAccess({
      role: "OPERATOR",
      position: "CLOSER",
      dataScope: "OWN",
      permissions: ["dashboard.read", "dashboard.write", "reports.read"],
      areaName: "Ventas",
      teamName: "High Ticket",
      managerName: "Director Comercial",
    });

    expect(summary.badges).toEqual(["Closer", "Puede editar reportes", "Sin admin usuarios"]);
    expect(summary.scopeLabel).toBe("Solo su propio reporte");
    expect(summary.description).toBe("Puede editar reportes diarios dentro de su alcance: solo su propio reporte.");
  });

  it("summarizes a read-only viewer", () => {
    const summary = summarizeEffectiveAccess({
      role: "VIEWER",
      position: "VIEWER",
      dataScope: "OWN",
      permissions: ["dashboard.read", "reports.read"],
      areaName: null,
      teamName: null,
      managerName: null,
    });

    expect(summary.badges).toEqual(["Viewer", "Solo lectura", "Sin admin usuarios"]);
    expect(summary.scopeLabel).toBe("Solo su propio reporte");
    expect(summary.description).toBe("Puede consultar dashboard/reportes, pero no editar datos ni usuarios.");
  });

  it("explains area and team scope using names when available", () => {
    expect(summarizeEffectiveAccess({
      role: "OPERATOR",
      position: "DIRECTOR",
      dataScope: "AREA",
      permissions: ["dashboard.read", "dashboard.write", "reports.read"],
      areaName: "Comercial",
      teamName: null,
      managerName: null,
    }).scopeLabel).toBe("Área Comercial");

    expect(summarizeEffectiveAccess({
      role: "OPERATOR",
      position: "SETTER",
      dataScope: "TEAM",
      permissions: ["dashboard.read", "dashboard.write", "reports.read"],
      areaName: "Comercial",
      teamName: "Setters HT",
      managerName: null,
    }).scopeLabel).toBe("Equipo Setters HT");
  });
});
