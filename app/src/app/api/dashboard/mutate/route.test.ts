import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { DashboardActor } from "@/lib/dashboard-access";

/**
 * Behavioral RBAC + derived-aggregate regression for /api/dashboard/mutate.
 *
 * Production bug (control.unlockedecom.co, mobile Safari): a scoped closer
 * (Daryi Perez — position CLOSER / DataScope OWN) saved their own "Llenar
 * reporte" and got:
 *   "Guardado en colaborador, pero no se pudo actualizar el total diario: HTTP 403".
 * The own daily_entries upsert was allowed, but the browser's follow-up
 * daily_closer (aggregate) upsert was — correctly — forbidden for a non-global
 * user. Fix: derive the daily_closer aggregate server-side after the allowed
 * daily_entries write, WITHOUT granting the user a direct aggregate write.
 *
 * These tests prove, end to end through the route handler:
 *  1. A scoped user's OWN daily_entries upsert is allowed.
 *  2. A direct daily_closer (aggregate) write stays forbidden for scoped users.
 *  3. The server-side aggregate recompute is wired after an allowed
 *     daily_entries upsert AND delete for a high-ticket closer.
 *  4. Global admins keep their direct daily_closer write (no behavior change).
 *  5. A recompute failure never fails the user's own (already-saved) report.
 */

vi.mock("@/lib/dashboard-actor", () => ({
  getDashboardActor: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/dashboard-store", () => {
  class DashboardStoreError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    DashboardStoreError,
    dashboardSelect: vi.fn(async () => []),
    dashboardUpsert: vi.fn(async () => {}),
    dashboardInsert: vi.fn(async () => []),
    dashboardDelete: vi.fn(async () => {}),
    recomputeCommercialCloserAggregate: vi.fn(async () => true),
  };
});

import { POST } from "@/app/api/dashboard/mutate/route";
import { getDashboardActor } from "@/lib/dashboard-actor";
import {
  dashboardDelete,
  dashboardUpsert,
  recomputeCommercialCloserAggregate,
} from "@/lib/dashboard-store";

const getActorMock = vi.mocked(getDashboardActor);
const upsertMock = vi.mocked(dashboardUpsert);
const deleteMock = vi.mocked(dashboardDelete);
const recomputeMock = vi.mocked(recomputeCommercialCloserAggregate);

function actor(overrides: Partial<DashboardActor>): DashboardActor {
  return {
    role: "OPERATOR",
    permissions: ["dashboard.read"],
    position: "CLOSER",
    dataScope: "OWN",
    name: "Daryi Perez",
    email: "daryi@naicipa.com",
    ghlUserName: "Daryi Perez",
    areaName: null,
    teamName: null,
    ...overrides,
  };
}

function asActor(a: DashboardActor) {
  getActorMock.mockResolvedValue({ userId: "user-1", actor: a });
}

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  recomputeMock.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scoped closer own daily_entries upsert (the fix path)", () => {
  it("allows the own-fill upsert AND triggers a server-side aggregate recompute", async () => {
    // Read-only scoped closer: NOT a broad dashboard writer. Allowed only via the
    // narrow own-collaborator daily_entries exception.
    asActor(actor({ permissions: ["dashboard.read"] }));

    const res = await POST(
      req({
        op: "upsert",
        table: "daily_entries",
        values: { date: "2026-06-17", member: "Daryi Perez", sales_organic: 2, revenue_organic: 5000 },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "recomputed" });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith("daily_entries", expect.objectContaining({ member: "Daryi Perez" }));
    expect(recomputeMock).toHaveBeenCalledWith("2026-06-17");
  });

  it("does NOT recompute for a non-priority date (legacy aggregate stays manual)", async () => {
    asActor(actor({ permissions: ["dashboard.read"] }));

    const res = await POST(
      req({
        op: "upsert",
        table: "daily_entries",
        values: { date: "2026-05-30", member: "Daryi Perez", sales_organic: 2 },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "skipped" });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it("keeps the user's report saved even when the derived recompute fails (deferred, not 403/500)", async () => {
    asActor(actor({ permissions: ["dashboard.read"] }));
    recomputeMock.mockRejectedValueOnce(new Error("rds unavailable"));

    const res = await POST(
      req({
        op: "upsert",
        table: "daily_entries",
        values: { date: "2026-06-17", member: "Daryi Perez", sales_organic: 2 },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "deferred" });
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});

describe("aggregate daily_closer stays forbidden for non-global users (RBAC not weakened)", () => {
  it("blocks a scoped user WITH dashboard.write from upserting daily_closer directly", async () => {
    // Even with write permission, a non-global (DataScope OWN) user must not write
    // an aggregate table.
    asActor(actor({ permissions: ["dashboard.read", "dashboard.write"], dataScope: "OWN" }));

    const res = await POST(
      req({ op: "upsert", table: "daily_closer", values: { date: "2026-06-17", q_ventas_ht: 5 } }),
    );

    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it("blocks a read-only scoped closer from writing daily_closer directly", async () => {
    asActor(actor({ permissions: ["dashboard.read"] }));

    const res = await POST(
      req({ op: "upsert", table: "daily_closer", values: { date: "2026-06-17", q_ventas_ht: 5 } }),
    );

    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
  });
});

describe("server-side recompute is wired on an allowed daily_entries delete", () => {
  it("recomputes the aggregate after a commercial director deletes a closer's row", async () => {
    // Commercial director scoped to the Ventas area owns every closer's rows.
    asActor(
      actor({
        position: "DIRECTOR",
        dataScope: "AREA",
        areaName: "Ventas",
        permissions: ["dashboard.read", "dashboard.write"],
        ghlUserName: "Some Director",
        name: "Some Director",
        email: "director@naicipa.com",
      }),
    );

    const res = await POST(
      req({ op: "delete", table: "daily_entries", match: { date: "2026-06-17", member: "Daryi Perez" } }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "recomputed" });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(recomputeMock).toHaveBeenCalledWith("2026-06-17");
  });
});

describe("global admin behavior is preserved", () => {
  it("still allows a direct daily_closer upsert and does NOT run the entry-derived recompute", async () => {
    asActor(actor({ role: "ADMIN", position: "ADMIN", permissions: [], dataScope: "ALL" }));

    const res = await POST(
      req({ op: "upsert", table: "daily_closer", values: { date: "2026-06-17", q_ventas_ht: 5 } }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "skipped" });
    expect(upsertMock).toHaveBeenCalledWith("daily_closer", expect.objectContaining({ date: "2026-06-17" }));
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it("allows an admin daily_entries upsert and still recomputes the closer aggregate", async () => {
    asActor(actor({ role: "ADMIN", position: "ADMIN", permissions: [], dataScope: "ALL" }));

    const res = await POST(
      req({
        op: "upsert",
        table: "daily_entries",
        values: { date: "2026-06-17", member: "Daryi Perez", sales_organic: 9 },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, aggregate: "recomputed" });
    expect(recomputeMock).toHaveBeenCalledWith("2026-06-17");
  });
});

describe("unauthenticated requests", () => {
  it("returns 401 when there is no actor", async () => {
    getActorMock.mockResolvedValue(null);
    const res = await POST(
      req({ op: "upsert", table: "daily_entries", values: { date: "2026-06-17", member: "Daryi Perez" } }),
    );
    expect(res.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
