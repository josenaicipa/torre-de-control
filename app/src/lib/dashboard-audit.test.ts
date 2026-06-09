import { describe, expect, it } from "vitest";
import {
  auditTargetForDashboardMutation,
  buildDashboardMutationAuditMetadata,
  findDashboardExistingRow,
  shouldAuditDashboardMutation,
} from "./dashboard-audit";

describe("dashboard-audit", () => {
  it("audits Reporte Diario aggregate and member daily mutations only", () => {
    expect(shouldAuditDashboardMutation("upsert", "daily_closer")).toBe(true);
    expect(shouldAuditDashboardMutation("upsert", "daily_entries")).toBe(true);
    expect(shouldAuditDashboardMutation("delete", "daily_entries")).toBe(true);
    expect(shouldAuditDashboardMutation("upsert", "kpi_data")).toBe(false);
    expect(shouldAuditDashboardMutation("insert", "ads_entries")).toBe(false);
  });

  it("targets daily_closer by date and daily_entries by date plus member", () => {
    expect(auditTargetForDashboardMutation("daily_closer", { date: "2026-06-08" })).toBe(
      "daily_closer:2026-06-08",
    );
    expect(auditTargetForDashboardMutation("daily_entries", { date: "2026-06-08", member: "Carlos Velez" })).toBe(
      "daily_entries:2026-06-08:Carlos Velez",
    );
  });

  it("finds the existing row using the table natural key", () => {
    const rows = [
      { date: "2026-06-07", q_ventas_ht: 3 },
      { date: "2026-06-08", q_ventas_ht: 8 },
    ];
    expect(findDashboardExistingRow("daily_closer", rows, { date: "2026-06-08" })).toEqual(rows[1]);

    const entryRows = [
      { date: "2026-06-08", member: "Carlos Velez", sales_organic: 1 },
      { date: "2026-06-08", member: "Daryi Perez", sales_organic: 2 },
    ];
    expect(findDashboardExistingRow("daily_entries", entryRows, { date: "2026-06-08", member: "Daryi Perez" })).toEqual(
      entryRows[1],
    );
  });

  it("stores actor identity, source, previous values, new values, and changed fields", () => {
    const metadata = buildDashboardMutationAuditMetadata({
      op: "upsert",
      table: "daily_closer",
      values: { date: "2026-06-08", q_ventas_ht: 8, valor_venta_ht: 12000, agendas_final: 10 },
      previousRow: { date: "2026-06-08", q_ventas_ht: 0, valor_venta_ht: 12000, agendas_final: 9 },
      actor: { email: "admin@example.com", name: "Admin User", ghlUserName: null },
    });

    expect(metadata).toEqual({
      op: "upsert",
      table: "daily_closer",
      source: "dashboard_api",
      actor: { email: "admin@example.com", name: "Admin User", ghlUserName: null },
      key: { date: "2026-06-08" },
      changedFields: ["q_ventas_ht", "agendas_final"],
      previousValues: { q_ventas_ht: 0, agendas_final: 9 },
      newValues: { q_ventas_ht: 8, agendas_final: 10 },
      payloadValues: { date: "2026-06-08", q_ventas_ht: 8, valor_venta_ht: 12000, agendas_final: 10 },
    });
  });
});
