import { describe, expect, it } from "vitest";
import {
  conflictTarget,
  isDashboardTable,
  sanitizeValues,
  tableConfig,
} from "./dashboard-tables";

describe("isDashboardTable", () => {
  it("accepts whitelisted tables", () => {
    expect(isDashboardTable("kpi_data")).toBe(true);
    expect(isDashboardTable("daily_entries")).toBe(true);
    expect(isDashboardTable("ads_entries")).toBe(true);
    expect(isDashboardTable("daily_closer")).toBe(true);
  });

  it("rejects anything not whitelisted", () => {
    expect(isDashboardTable("users")).toBe(false);
    expect(isDashboardTable("daily_entries; drop table users")).toBe(false);
    expect(isDashboardTable("")).toBe(false);
    expect(isDashboardTable(null)).toBe(false);
    expect(isDashboardTable(42)).toBe(false);
  });
});

describe("sanitizeValues", () => {
  it("keeps only known columns and drops unknown keys", () => {
    const out = sanitizeValues("daily_entries", {
      date: "2026-05-22",
      member: "Carlos",
      posts: 3,
      // not real columns — must be stripped:
      is_admin: true,
      member_role: "ADMIN",
      "; delete": 1,
    });
    expect(out).toEqual({ date: "2026-05-22", member: "Carlos", posts: 3 });
  });

  it("keeps manual report text fields for qualitative notes", () => {
    const out = sanitizeValues("daily_entries", {
      date: "2026-05-22",
      member: "Carlos Velez",
      showup_notes: "revisar Fathom",
      hot_leads_evidence: "AM HOT",
      blockers: "sin bloqueo",
      setter_findings: "objeción precio",
    });
    expect(out).toEqual({
      date: "2026-05-22",
      member: "Carlos Velez",
      showup_notes: "revisar Fathom",
      hot_leads_evidence: "AM HOT",
      blockers: "sin bloqueo",
      setter_findings: "objeción precio",
    });
  });

  it("omits undefined values so partial upserts only touch sent fields", () => {
    const out = sanitizeValues("kpi_data", { year: 2026, month: 4, revenue: undefined });
    expect(out).toEqual({ year: 2026, month: 4 });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizeValues("kpi_data", null)).toEqual({});
    expect(sanitizeValues("kpi_data", "x")).toEqual({});
    expect(sanitizeValues("kpi_data", [1, 2, 3])).toEqual({});
  });

  it("preserves falsy-but-valid numeric values like 0", () => {
    const out = sanitizeValues("daily_entries", { member: "Karen", posts: 0, mensajes: 0 });
    expect(out).toEqual({ member: "Karen", posts: 0, mensajes: 0 });
  });

  it("allows the explicit setter metric columns", () => {
    const out = sanitizeValues("daily_entries", {
      member: "Carlos Velez",
      setter_new_conversations: 7,
      setter_new_inbound: 3,
      setter_new_outbound: 4,
      setter_outbound_replies: 2,
      follow_ups: 5,
      setter_calls_proposed: 6,
      setter_links_sent: 1,
      setter_secret_note: "strip me",
    });
    expect(out).toEqual({
      member: "Carlos Velez",
      setter_new_conversations: 7,
      setter_new_inbound: 3,
      setter_new_outbound: 4,
      setter_outbound_replies: 2,
      follow_ups: 5,
      setter_calls_proposed: 6,
      setter_links_sent: 1,
    });
  });
});

describe("conflictTarget", () => {
  it("joins the conflict columns when present", () => {
    expect(conflictTarget("kpi_data")).toBe("year,month");
    expect(conflictTarget("daily_entries")).toBe("date,member");
    expect(conflictTarget("daily_closer")).toBe("date");
  });

  it("is undefined for tables without a conflict target", () => {
    expect(conflictTarget("ads_entries")).toBeUndefined();
  });
});

describe("tableConfig", () => {
  it("marks daily_entries as member-scoped and the rest as aggregate", () => {
    expect(tableConfig("daily_entries").scope).toBe("member");
    expect(tableConfig("kpi_data").scope).toBe("aggregate");
    expect(tableConfig("ads_entries").scope).toBe("aggregate");
    expect(tableConfig("daily_closer").scope).toBe("aggregate");
  });
});
