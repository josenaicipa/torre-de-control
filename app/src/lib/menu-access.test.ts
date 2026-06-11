import { describe, expect, it } from "vitest";
import {
  deriveMenuAccessFromPermissions,
  menuAccessToPermissions,
  MENU_ACCESS_ITEMS,
  normalizeMenuAccess,
} from "./menu-access";
import { ALL_PERMISSIONS } from "./permissions";

describe("menu access", () => {
  it("lists the same user-facing sections as the left navigation", () => {
    expect(MENU_ACCESS_ITEMS.map((item) => item.id)).toEqual([
      "torre",
      "colab",
      "agendas",
      "control",
      "operaciones",
      "operaciones-estudiantes",
      "operaciones-cartera",
      "operaciones-mentores",
      "operaciones-catalogo",
      "operaciones-importar",
      "comunidad-dropi",
      "detalle",
      "equipo",
      "funnel",
      "hist",
      "admin",
    ]);
  });

  it("normalizes posted menu tabs and ignores unknown values", () => {
    expect(normalizeMenuAccess(["torre", "admin", "bad", "torre"])).toEqual(["torre", "admin"]);
  });

  it("translates selected menu tabs to existing technical permissions", () => {
    expect(menuAccessToPermissions(["torre", "detalle", "hist"])).toEqual(["dashboard.read", "reports.read"]);
    expect(menuAccessToPermissions(["admin"])).toEqual(["users.read", "users.create", "users.update", "users.suspend"]);
    expect(menuAccessToPermissions(["operaciones-cartera", "operaciones-importar"])).toEqual([
      "operaciones.read",
      "operaciones.payments.write",
      "operaciones.import",
    ]);
  });

  it("derives checked menu tabs from stored permissions for editing users", () => {
    expect(deriveMenuAccessFromPermissions("VIEWER", ["dashboard.read", "reports.read"])).toEqual([
      "torre",
      "colab",
      "agendas",
      "control",
      "detalle",
      "equipo",
      "funnel",
      "hist",
    ]);
    expect(deriveMenuAccessFromPermissions("OPERATOR", ["operaciones.read", "operaciones.write"])).toEqual([
      "operaciones",
      "operaciones-estudiantes",
      "operaciones-catalogo",
      "comunidad-dropi",
    ]);
  });

  it("gives admins all menu tabs and keeps permissions fail-closed to known ids", () => {
    expect(deriveMenuAccessFromPermissions("ADMIN", [])).toEqual(MENU_ACCESS_ITEMS.map((item) => item.id));
    expect(menuAccessToPermissions(["admin", "operaciones", "torre"]).every((p) => ALL_PERMISSIONS.includes(p))).toBe(true);
  });
});
