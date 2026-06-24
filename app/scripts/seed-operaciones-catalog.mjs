#!/usr/bin/env node
// Idempotent boot-time seed for the Operaciones default catalog.
//
// Fixes the post-deploy gap where the Nivel 3/4/5 programs were added to
// `src/lib/operaciones-default-config.ts` but never written to the existing
// production database, so `/operaciones/catalogo` (which reads Product rows from
// the DB) showed nothing for them.
//
// Contract — strictly additive, safe to run on every boot:
// - Products are ensured by `slug`: created when missing, left UNTOUCHED when
//   they already exist (names/prices/flags are operator-editable from the UI, so
//   re-seeding must never clobber those edits).
// - LearnWorlds access configs are ensured per (product, lwExternalId): created
//   when missing, never duplicated, never deactivated. Placeholders without an
//   `lwExternalId` (e.g. marca-propia) are skipped — the column is required and
//   the operator wires that slug manually.
// - Nothing is ever deleted, so existing sales/enrollments and manual configs
//   are preserved, including the inactive legacy `mentoria-principal` product.
import { PrismaClient } from "@prisma/client";
import {
  defaultOperacionesProducts,
  defaultLearnWorldsAccessPlaceholders,
} from "./operaciones-default-config.data.mjs";

async function ensureProduct(prisma, product) {
  const existing = await prisma.product.findUnique({
    where: { slug: product.slug },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.product.create({
    data: {
      name: product.name,
      slug: product.slug,
      description: product.description ?? null,
      basePriceUsd: product.basePriceUsd,
      currency: product.currency,
      saleLimit: product.saleLimit,
      allowsInstallments: product.allowsInstallments,
      requiresInitialPayment: product.requiresInitialPayment,
      generatesCommission: product.generatesCommission,
      defaultCommissionPercent: product.defaultCommissionPercent,
      isMainProduct: product.isMainProduct,
      isActive: product.isActive,
      programLevel: product.programLevel ?? null,
      displayOrder: product.displayOrder ?? null,
      contractDisplayName: product.contractDisplayName ?? null,
      includesAdvancedClasses: product.includesAdvancedClasses,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function ensureAccessConfig(prisma, productId, cfg) {
  const existing = await prisma.learnWorldsAccessConfig.findUnique({
    where: {
      productId_lwExternalId: { productId, lwExternalId: cfg.lwExternalId },
    },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.learnWorldsAccessConfig.create({
    data: {
      productId,
      lwProductType: cfg.accessType,
      lwExternalId: cfg.lwExternalId,
      lwDisplayName: cfg.lwDisplayName ?? null,
      isActive: cfg.isActive,
    },
  });
  return true;
}

async function main() {
  const prisma = new PrismaClient();
  let createdProducts = 0;
  let createdConfigs = 0;
  try {
    for (const product of defaultOperacionesProducts) {
      const { id: productId, created } = await ensureProduct(prisma, product);
      if (created) createdProducts++;

      const placeholders = defaultLearnWorldsAccessPlaceholders.filter(
        (cfg) => cfg.productSlug === product.slug && cfg.lwExternalId,
      );
      for (const cfg of placeholders) {
        if (await ensureAccessConfig(prisma, productId, cfg)) createdConfigs++;
      }
    }
    console.log(
      "[seed-operaciones-catalog] completed",
      JSON.stringify({
        products: defaultOperacionesProducts.length,
        createdProducts,
        createdConfigs,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[seed-operaciones-catalog] failed", error?.message || error);
  process.exit(1);
});
