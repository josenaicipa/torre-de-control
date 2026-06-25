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
}) {
  return {
    id: "enr-1",
    upgradeFromEnrollmentId: opts.previous ? "src-1" : null,
    student: { email: "alumno@example.com", fullName: "Alumno" },
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

/** Reads the LW productId out of a recorded fetch call's JSON body. */
function callProductId(call: unknown[]): string {
  const init = call[1] as { body: string };
  return JSON.parse(init.body).productId as string;
}

function callMethod(call: unknown[]): string {
  const init = call[1] as { method: string };
  return init.method;
}

describe("enrollEnrollmentInLearnWorlds", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.LW_BASE_URL = "https://lw.example.com";
    process.env.LW_ACCESS_TOKEN = "token-test";
    process.env.LW_CLIENT_ID = "client-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("new sale: only enrols the product configs, never revokes", async () => {
    findUnique.mockResolvedValue(buildEnrollment({ current: [COURSE_N4] }));
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(true);
    expect(result.accessStatus).toBe("ACTIVE");
    expect(result.enrolledCount).toBe(1);
    expect(result.revokedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callMethod(fetchMock.mock.calls[0])).toBe("POST");
    expect(callProductId(fetchMock.mock.calls[0])).toBe("course-n4");
    // Persisted as ACTIVE with no sync error.
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

    const posts = fetchMock.mock.calls.filter((c) => callMethod(c) === "POST");
    const deletes = fetchMock.mock.calls.filter((c) => callMethod(c) === "DELETE");
    expect(posts.map(callProductId)).toEqual(["course-n4"]);
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
    // Only the old level course is revoked; the shared advanced bundle is kept.
    expect(deletes.map(callProductId)).toEqual(["course-n3"]);
    expect(deletes.map(callProductId)).not.toContain("bundle-advanced");
  });

  it("upgrade: a failed revocation leaves the enrollment in SYNC_ERROR", async () => {
    findUnique.mockResolvedValue(
      buildEnrollment({ current: [COURSE_N4], previous: [COURSE_N3] }),
    );
    fetchMock.mockImplementation((_url: string, init: { method: string }) => {
      if (init.method === "DELETE") {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => "boom",
        });
      }
      return Promise.resolve({ ok: true, text: async () => "" });
    });

    const result = await enrollEnrollmentInLearnWorlds("enr-1");

    expect(result.ok).toBe(false);
    expect(result.accessStatus).toBe("SYNC_ERROR");
    // New access was granted, only the revoke failed.
    expect(result.enrolledCount).toBe(1);
    expect(result.revokedCount).toBe(0);
    expect(result.revokeError).toMatch(/nivel anterior/i);
    expect(result.revokeError).not.toContain("token-test");
    // Persisted with the error visible on the enrollment.
    const persisted = update.mock.calls.at(-1)?.[0].data;
    expect(persisted.accessStatus).toBe("SYNC_ERROR");
    expect(persisted.learnWorldsSyncError).toMatch(/nivel anterior/i);
  });
});
