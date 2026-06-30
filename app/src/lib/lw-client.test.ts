import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma client the module under test imports. Each test wires up
// findUnique to return the enrollment shape it needs and inspects update calls.
const findUnique = vi.fn();
const update = vi.fn();
vi.mock("./prisma", () => ({
  prisma: {
    studentProductEnrollment: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { enrollEnrollmentInLearnWorlds } from "./lw-client";

type Config = {
  lwProductType: "COURSE" | "BUNDLE" | "SUBSCRIPTION";
  lwExternalId: string;
  lwDisplayName: string | null;
};

const COURSE_N3: Config = {
  lwProductType: "COURSE",
  lwExternalId: "course-n3",
  lwDisplayName: "Nivel 3",
};
const COURSE_N4: Config = {
  lwProductType: "COURSE",
  lwExternalId: "course-n4",
  lwDisplayName: "Nivel 4",
};
const ADVANCED: Config = {
  lwProductType: "BUNDLE",
  lwExternalId: "bundle-advanced",
  lwDisplayName: "Clases avanzadas",
};

function buildEnrollment(opts: {
  current: Config[];
  previous?: Config[];
  fullName?: string;
  phone?: string | null;
}) {
  return {
    id: "enr-1",
    upgradeFromEnrollmentId: opts.previous ? "src-1" : null,
    student: {
      email: "alumno@example.com",
      fullName: opts.fullName ?? "Alumno",
      phone: opts.phone ?? null,
    },
    product: { learnWorldsAccessConfigs: opts.current },
    upgradeFromEnrollment: opts.previous
      ? { product: { learnWorldsAccessConfigs: opts.previous } }
      : null,
  };
}

/** Returns the recorded prisma update payload targeting the given enrollment id. */
function updateDataFor(id: string): Record<string, unknown> | undefined {
  const call = update.mock.calls.find(
    (c) => (c[0] as { where: { id: string } }).where.id === id,
  );
  return call?.[0].data;
}

function callMethod(call: unknown[]): string {
  return (call[1] as { method: string }).method;
}

function callUrl(call: unknown[]): string {
  return call[0] as string;
}

function callBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as { body?: string };
  return JSON.parse(init.body ?? "{}");
}

/** Reads the LW productId out of a recorded fetch call's JSON body. */
function callProductId(call: unknown[]): string {
  return callBody(call).productId as string;
}

/** Enrolment POSTs (grant a config), excluding the user-creation POST. */
function enrollPosts(): unknown[][] {
  return fetchMock.mock.calls.filter(
    (c) => callMethod(c) === "POST" && callUrl(c).endsWith("/enrollment"),
  );
}

/** The user-creation POST(s) to /users (no /enrollment suffix). */
function createUserPosts(): unknown[][] {
  return fetchMock.mock.calls.filter(
    (c) => callMethod(c) === "POST" && callUrl(c).endsWith("/users"),
  );
}

/** Best-effort GHL mirror calls (any /contacts URL). */
function ghlCalls(): unknown[][] {
  return fetchMock.mock.calls.filter((c) => callUrl(c).includes("/contacts"));
}

const fetchMock = vi.fn();

describe("enrollEnrollmentInLearnWorlds", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LW_BASE_URL = "https://lw.example.com";
    process.env.LW_ACCESS_TOKEN = "token-test";
    process.env.LW_CLIENT_ID = "client-test";
    delete process.env.GHL_BASE_URL;
    delete process.env.GHL_API_KEY;
    delete process.env.GHL_API_VERSION;
    delete process.env.GHL_LOCATION_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("new sale: existing user, only enrols the product configs, never revokes", async () => {
    findUnique.mockResolvedValue(buildEnrollment({ current: [COURSE_N4] }));
    // GET existence check + enrol both resolve ok (user already exists).
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.accessStatus).toBe("ACTIVE");
    expect(result.enrolledCount).toBe(1);
    expect(result.revokedCount).toBe(0);
    // Existing user: no creation POST, no GHL mirror.
    expect(createUserPosts()).toHaveLength(0);
    expect(ghlCalls()).toHaveLength(0);
    expect(result.userCreated).toBeFalsy();
    expect(enrollPosts().map(callProductId)).toEqual(["course-n4"]);
    expect(update.mock.calls.at(-1)?.[0].data.accessStatus).toBe("ACTIVE");
  });

  it("upgrade: enrols the new level and revokes the distinct previous config", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({ current: [COURSE_N4], previous: [COURSE_N3] }),
    );
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.accessStatus).toBe("ACTIVE");
    expect(result.enrolledCount).toBe(1);
    expect(result.revokedCount).toBe(1);

    const deletes = fetchMock.mock.calls.filter((c) => callMethod(c) === "DELETE");
    expect(enrollPosts().map(callProductId)).toEqual(["course-n4"]);
    expect(deletes.map(callProductId)).toEqual(["course-n3"]);
  });

  it("upgrade: keeps shared advanced classes (no revoke for a config in both levels)", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({
        current: [COURSE_N4, ADVANCED],
        previous: [COURSE_N3, ADVANCED],
      }),
    );
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.enrolledCount).toBe(2);
    expect(result.revokedCount).toBe(1);

    const deletes = fetchMock.mock.calls.filter((c) => callMethod(c) === "DELETE");
    expect(deletes.map(callProductId)).toEqual(["course-n3"]);
    expect(deletes.map(callProductId)).not.toContain("bundle-advanced");
  });

  it("upgrade: a failed revocation leaves the enrollment in SYNC_ERROR", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({ current: [COURSE_N4], previous: [COURSE_N3] }),
    );
    fetchMock.mockImplementation((_url: string, init: { method: string }) => {
      if (init.method === "DELETE") {
        return Promise.resolve({ ok: false, status: 500, text: async () => "boom" });
      }
      return Promise.resolve({ ok: true, text: async () => "" });
    });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(false);
    expect(result.accessStatus).toBe("SYNC_ERROR");
    expect(result.enrolledCount).toBe(1);
    expect(result.revokedCount).toBe(0);
    expect(result.revokeError).toMatch(/nivel anterior/i);
    expect(result.revokeError).not.toContain("token-test");
    const persisted = update.mock.calls.at(-1)?.[0].data;
    expect(persisted.accessStatus).toBe("SYNC_ERROR");
    expect(persisted.learnWorldsSyncError).toMatch(/nivel anterior/i);
  });

  it("existing user: does not create the user nor send a password to GHL", async () => {
    findUnique.mockResolvedValue(buildEnrollment({ current: [COURSE_N4] }));
    process.env.GHL_BASE_URL = "https://ghl.example.com";
    process.env.GHL_API_KEY = "ghl-token";
    process.env.GHL_API_VERSION = "2021-07-28";
    process.env.GHL_LOCATION_ID = "loc-1";
    // GET existence returns ok -> the user already exists.
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.userCreated).toBeFalsy();
    expect(createUserPosts()).toHaveLength(0);
    // No GHL mirror because we never created the user / computed a password.
    expect(ghlCalls()).toHaveLength(0);
  });

  it("missing user: creates with password Christian2863* before enrolling", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({
        current: [COURSE_N4],
        fullName: "christian alumno",
        phone: "+57 300 555 2863",
      }),
    );
    fetchMock.mockImplementation((url: string, init: { method: string }) => {
      // Existence GET on /users/{email} -> 404 (user missing).
      if (init.method === "GET") {
        return Promise.resolve({ ok: false, status: 404, text: async () => "" });
      }
      return Promise.resolve({ ok: true, text: async () => "" });
    });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.accessStatus).toBe("ACTIVE");
    expect(result.userCreated).toBe(true);

    const creates = createUserPosts();
    expect(creates).toHaveLength(1);
    expect(callBody(creates[0]).password).toBe("Christian2863*");

    // The user must be created BEFORE the enrolment call.
    const createIndex = fetchMock.mock.calls.findIndex(
      (c) => callMethod(c) === "POST" && callUrl(c).endsWith("/users"),
    );
    const enrollIndex = fetchMock.mock.calls.findIndex(
      (c) => callMethod(c) === "POST" && callUrl(c).endsWith("/enrollment"),
    );
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(createIndex).toBeLessThan(enrollIndex);
    // Secrets never leak into the password body URL/headers we send.
    expect(callBody(creates[0]).password).not.toContain("token-test");
  });

  it("missing user with insufficient phone: SYNC_ERROR without enrolling", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({
        current: [COURSE_N4],
        fullName: "christian",
        phone: "12",
      }),
    );
    fetchMock.mockImplementation((url: string, init: { method: string }) => {
      if (init.method === "GET") {
        return Promise.resolve({ ok: false, status: 404, text: async () => "" });
      }
      return Promise.resolve({ ok: true, text: async () => "" });
    });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(false);
    expect(result.accessStatus).toBe("SYNC_ERROR");
    expect(result.error).toMatch(/tel[eé]fono/i);
    // Never attempted to create the user or enrol.
    expect(createUserPosts()).toHaveLength(0);
    expect(enrollPosts()).toHaveLength(0);
    const persisted = updateDataFor("enr-1");
    expect(persisted?.accessStatus).toBe("SYNC_ERROR");
  });

  it("GHL failure does not fail the LearnWorlds access", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({
        current: [COURSE_N4],
        fullName: "christian alumno",
        phone: "+57 300 555 2863",
      }),
    );
    process.env.GHL_BASE_URL = "https://ghl.example.com";
    process.env.GHL_API_KEY = "ghl-token";
    process.env.GHL_API_VERSION = "2021-07-28";
    process.env.GHL_LOCATION_ID = "loc-1";
    fetchMock.mockImplementation((url: string, init: { method: string }) => {
      if (url.includes("/contacts")) {
        return Promise.resolve({ ok: false, status: 500, text: async () => "ghl boom" });
      }
      if (init.method === "GET") {
        return Promise.resolve({ ok: false, status: 404, text: async () => "" });
      }
      return Promise.resolve({ ok: true, text: async () => "" });
    });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    // LW access succeeded; GHL is only a non-fatal warning.
    expect(result.ok).toBe(true);
    expect(result.accessStatus).toBe("ACTIVE");
    expect(result.userCreated).toBe(true);
    expect(result.ghlWarning).toMatch(/GHL/i);
    expect(ghlCalls().length).toBeGreaterThan(0);
    const persisted = update.mock.calls.at(-1)?.[0].data;
    expect(persisted.accessStatus).toBe("ACTIVE");
  });
});
