import { describe, expect, it } from "vitest";
import {
  buildDeleteSql,
  buildSelectSql,
  buildUpsertSql,
  coerceInputValue,
  normalizeOutputValue,
  prepareValues,
} from "./dashboard-sql";

describe("dashboard-sql", () => {
  it("builds member-scoped selects with bound placeholders", () => {
    expect(buildSelectSql("daily_entries", 2)).toBe('SELECT * FROM "daily_entries" WHERE "member" IN ($1, $2)');
  });

  it("rejects non-whitelisted columns before SQL execution", () => {
    expect(() => prepareValues("daily_entries", { member: "Carlos", "member;DROP": "x" })).toThrow(
      "invalid-column:daily_entries",
    );
  });

  it("builds upserts from whitelisted identifiers only", () => {
    expect(buildUpsertSql("kpi_data", ["year", "month", "revenue"], ["year", "month"])).toBe(
      'INSERT INTO "kpi_data" ("year", "month", "revenue") VALUES ($1, $2, $3) ON CONFLICT ("year", "month") DO UPDATE SET "revenue" = EXCLUDED."revenue"',
    );
  });

  it("builds protected deletes only with filters", () => {
    expect(buildDeleteSql("ads_entries", ["id"])).toBe('DELETE FROM "ads_entries" WHERE "id" = $1');
    expect(() => buildDeleteSql("ads_entries", [])).toThrow("refusing-unfiltered-delete");
  });

  it("coerces empty/invalid numbers to null and serializes dates", () => {
    expect(coerceInputValue("number", "")).toBeNull();
    expect(coerceInputValue("number", "12.5")).toBe(12.5);
    expect(normalizeOutputValue("date", new Date("2026-05-22T12:00:00Z"))).toBe("2026-05-22");
  });
});
