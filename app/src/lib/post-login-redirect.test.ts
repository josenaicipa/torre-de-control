import { describe, expect, it } from "vitest";
import { resolveLandingPath, type LandingActor } from "./post-login-redirect";

function actor(overrides: Partial<LandingActor>): LandingActor {
  return {
    role: "VIEWER",
    position: "VIEWER",
    permissions: [],
    ...overrides,
  };
}

describe("resolveLandingPath", () => {
  it("manda a la raíz a los lectores del dashboard", () => {
    expect(resolveLandingPath(actor({ role: "OPERATOR", permissions: ["dashboard.read"] }))).toBe("/");
  });

  it("manda a la raíz a los ADMIN aunque no tengan permisos explícitos", () => {
    expect(resolveLandingPath(actor({ role: "ADMIN", position: "ADMIN" }))).toBe("/");
    expect(resolveLandingPath(actor({ role: "VIEWER", position: "ADMIN" }))).toBe("/");
  });

  it("manda a /operaciones a las cuentas que solo pueden leer Operaciones", () => {
    expect(resolveLandingPath(actor({ role: "OPERATOR", permissions: ["operaciones.read"] }))).toBe("/operaciones");
  });

  it("manda a los MENTOR no-ADMIN a sus estudiantes", () => {
    expect(
      resolveLandingPath(actor({ role: "MENTOR", position: "VIEWER", permissions: ["operaciones.read"] })),
    ).toBe("/operaciones/mis-estudiantes");
  });

  it("no deja que un MENTOR con grants viejos de dashboard caiga en la Torre", () => {
    expect(
      resolveLandingPath(actor({ role: "MENTOR", position: "VIEWER", permissions: ["dashboard.read"] })),
    ).toBe("/operaciones/mis-estudiantes");
  });

  it("manda a /admin/users a quien solo administra usuarios sin dashboard", () => {
    expect(resolveLandingPath(actor({ role: "OPERATOR", permissions: ["users.read"] }))).toBe("/admin/users");
    expect(resolveLandingPath(actor({ role: "OPERATOR", permissions: ["users.update"] }))).toBe("/admin/users");
  });

  it("cae a /login solo cuando no hay ningún permiso usable", () => {
    expect(resolveLandingPath(actor({ role: "VIEWER", permissions: [] }))).toBe("/login");
  });
});
