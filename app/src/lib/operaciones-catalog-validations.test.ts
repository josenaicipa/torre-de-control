import { describe, it, expect } from "vitest";
import {
  createPaymentAccountSchema,
  createProductSchema,
  learnWorldsAccessConfigInputSchema,
  listCatalogActiveQuerySchema,
  updatePaymentAccountSchema,
  updateProductSchema,
} from "./operaciones-validations";

describe("listCatalogActiveQuerySchema", () => {
  it("defaults active to 'true' when omitted", () => {
    const parsed = listCatalogActiveQuerySchema.parse({});
    expect(parsed.active).toBe("true");
  });

  it("accepts 'true', 'false' and 'all'", () => {
    expect(listCatalogActiveQuerySchema.parse({ active: "true" }).active).toBe("true");
    expect(listCatalogActiveQuerySchema.parse({ active: "false" }).active).toBe("false");
    expect(listCatalogActiveQuerySchema.parse({ active: "all" }).active).toBe("all");
  });

  it("rejects arbitrary values", () => {
    expect(listCatalogActiveQuerySchema.safeParse({ active: "yes" }).success).toBe(false);
    expect(listCatalogActiveQuerySchema.safeParse({ active: "1" }).success).toBe(false);
  });
});

describe("createProductSchema (catalog)", () => {
  it("rejects a slug with spaces or uppercase", () => {
    expect(
      createProductSchema.safeParse({
        name: "Mentoría",
        slug: "Mentoria Principal",
        basePriceUsd: 2500,
      }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        name: "Mentoría",
        slug: "Mentoria",
        basePriceUsd: 2500,
      }).success,
    ).toBe(false);
  });

  it("accepts a 'Marca Propia' product without commission", () => {
    const parsed = createProductSchema.parse({
      name: "Marca Propia",
      slug: "marca-propia",
      basePriceUsd: 1000,
      generatesCommission: false,
      defaultCommissionPercent: 0,
      isMainProduct: false,
    });
    expect(parsed.generatesCommission).toBe(false);
    expect(parsed.defaultCommissionPercent).toBe(0);
    expect(parsed.saleLimit).toBe("ONE_PER_STUDENT");
  });

  it("accepts an inline LearnWorlds access configs array", () => {
    const parsed = createProductSchema.parse({
      name: "Mentoría principal",
      slug: "mentoria-principal",
      basePriceUsd: 0,
      learnWorldsAccessConfigs: [
        {
          lwProductType: "COURSE",
          lwExternalId: "nivel-5",
          lwDisplayName: "Nivel 5",
        },
        {
          lwProductType: "BUNDLE",
          lwExternalId: "clases-avanzadas",
        },
      ],
    });
    expect(parsed.learnWorldsAccessConfigs).toHaveLength(2);
    expect(parsed.learnWorldsAccessConfigs?.[0].lwProductType).toBe("COURSE");
    expect(parsed.learnWorldsAccessConfigs?.[0].isActive).toBe(true);
    expect(parsed.learnWorldsAccessConfigs?.[1].lwDisplayName ?? null).toBe(null);
  });

  it("accepts an empty learnWorldsAccessConfigs array", () => {
    const parsed = createProductSchema.parse({
      name: "Producto X",
      slug: "producto-x",
      basePriceUsd: 100,
      learnWorldsAccessConfigs: [],
    });
    expect(parsed.learnWorldsAccessConfigs).toEqual([]);
  });
});

describe("learnWorldsAccessConfigInputSchema", () => {
  it("requires lwProductType and lwExternalId", () => {
    expect(learnWorldsAccessConfigInputSchema.safeParse({}).success).toBe(false);
    expect(
      learnWorldsAccessConfigInputSchema.safeParse({
        lwProductType: "COURSE",
      }).success,
    ).toBe(false);
    expect(
      learnWorldsAccessConfigInputSchema.safeParse({
        lwExternalId: "abc",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid lwProductType", () => {
    expect(
      learnWorldsAccessConfigInputSchema.safeParse({
        lwProductType: "WORKSHOP",
        lwExternalId: "abc",
      }).success,
    ).toBe(false);
  });

  it("defaults isActive to true and lets the optional fields be omitted", () => {
    const parsed = learnWorldsAccessConfigInputSchema.parse({
      lwProductType: "SUBSCRIPTION",
      lwExternalId: "monthly-pass",
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.lwDisplayName ?? null).toBe(null);
    expect(parsed.description ?? null).toBe(null);
  });

  it("rejects an empty lwExternalId", () => {
    expect(
      learnWorldsAccessConfigInputSchema.safeParse({
        lwProductType: "COURSE",
        lwExternalId: "   ",
      }).success,
    ).toBe(false);
  });
});

describe("updateProductSchema (catalog)", () => {
  it("allows passing only learnWorldsAccessConfigs for replacement", () => {
    const parsed = updateProductSchema.parse({
      learnWorldsAccessConfigs: [
        {
          lwProductType: "COURSE",
          lwExternalId: "nivel-5",
        },
      ],
    });
    expect(parsed.learnWorldsAccessConfigs).toHaveLength(1);
  });

  it("allows clearing configs via empty array", () => {
    const parsed = updateProductSchema.parse({
      learnWorldsAccessConfigs: [],
    });
    expect(parsed.learnWorldsAccessConfigs).toEqual([]);
  });

  it("allows toggling isActive without touching configs", () => {
    const parsed = updateProductSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
    expect(parsed.learnWorldsAccessConfigs).toBeUndefined();
  });
});

describe("createPaymentAccountSchema (catalog)", () => {
  it("requires displayName even when other fields are provided", () => {
    expect(
      createPaymentAccountSchema.safeParse({
        currency: "USD",
        ownerName: "Unlocked Academy LLC",
      }).success,
    ).toBe(false);
  });

  it("defaults currency to USD and isActive to true", () => {
    const parsed = createPaymentAccountSchema.parse({ displayName: "Stripe US" });
    expect(parsed.currency).toBe("USD");
    expect(parsed.isActive).toBe(true);
  });
});

describe("updatePaymentAccountSchema (catalog)", () => {
  it("accepts a partial update of a single field", () => {
    const parsed = updatePaymentAccountSchema.parse({ isActive: false });
    expect(parsed.isActive).toBe(false);
    expect(parsed.displayName).toBeUndefined();
    expect(parsed.currency).toBeUndefined();
  });

  it("accepts a partial update changing only the display name", () => {
    const parsed = updatePaymentAccountSchema.parse({ displayName: "Stripe US v2" });
    expect(parsed.displayName).toBe("Stripe US v2");
    expect(parsed.isActive).toBeUndefined();
  });

  it("rejects an empty displayName", () => {
    expect(updatePaymentAccountSchema.safeParse({ displayName: "" }).success).toBe(false);
  });
});
