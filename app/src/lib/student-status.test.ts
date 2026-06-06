import { describe, expect, it } from "vitest";
import {
  STUDENT_STATUS_OPTIONS,
  studentStatusBadgeClass,
  studentStatusLabel,
} from "./student-status";

describe("studentStatusLabel", () => {
  it("traduce SEPARATED a 'Separado' (nunca el valor crudo)", () => {
    expect(studentStatusLabel("SEPARATED")).toBe("Separado");
  });

  it("traduce el resto de estados del enum a español", () => {
    expect(studentStatusLabel("ACTIVE")).toBe("Activo");
    expect(studentStatusLabel("PAUSED")).toBe("Pausado");
    expect(studentStatusLabel("COMPLETED")).toBe("Completado");
    expect(studentStatusLabel("DROPPED")).toBe("Retirado");
    expect(studentStatusLabel("EXTENDED")).toBe("Extendido");
    expect(studentStatusLabel("ACCESS_REVOKED")).toBe("Sin accesos");
    expect(studentStatusLabel("INACTIVE")).toBe("Inactivo");
    expect(studentStatusLabel("WITHDRAWN")).toBe("Dado de baja");
  });

  it("no devuelve nunca el valor crudo del enum para estados conocidos", () => {
    for (const opt of STUDENT_STATUS_OPTIONS) {
      expect(studentStatusLabel(opt.value)).not.toBe(opt.value);
    }
  });

  it("hace fallback al valor recibido si es desconocido", () => {
    expect(studentStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("STUDENT_STATUS_OPTIONS", () => {
  it("incluye la opción Separado para el filtro de estado", () => {
    const separado = STUDENT_STATUS_OPTIONS.find((o) => o.value === "SEPARATED");
    expect(separado).toEqual({ value: "SEPARATED", label: "Separado" });
  });

  it("no ofrece 'Dado de baja' (WITHDRAWN) como opción de filtro", () => {
    expect(STUDENT_STATUS_OPTIONS.some((o) => o.value === "WITHDRAWN")).toBe(false);
    expect(STUDENT_STATUS_OPTIONS.some((o) => o.label === "Dado de baja")).toBe(
      false,
    );
  });

  it("mantiene el label español de WITHDRAWN para datos históricos", () => {
    expect(studentStatusLabel("WITHDRAWN")).toBe("Dado de baja");
  });
});

describe("studentStatusBadgeClass", () => {
  it("da una clase de color a SEPARATED", () => {
    expect(studentStatusBadgeClass("SEPARATED")).toContain("orange");
  });

  it("hace fallback a slate para estados desconocidos", () => {
    expect(studentStatusBadgeClass("UNKNOWN")).toBe("bg-slate-100 text-slate-700");
  });
});
