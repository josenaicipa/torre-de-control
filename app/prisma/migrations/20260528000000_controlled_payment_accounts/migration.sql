-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_name_key" ON "PaymentProvider"("name");

-- CreateIndex
CREATE INDEX "PaymentProvider_isActive_idx" ON "PaymentProvider"("isActive");

-- AlterTable
ALTER TABLE "PaymentAccount"
    ADD COLUMN "ownerUserId" TEXT,
    ADD COLUMN "paymentProviderId" TEXT;

-- CreateIndex
CREATE INDEX "PaymentAccount_ownerUserId_idx" ON "PaymentAccount"("ownerUserId");

-- CreateIndex
CREATE INDEX "PaymentAccount_paymentProviderId_idx" ON "PaymentAccount"("paymentProviderId");

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default providers (idempotent on re-run).
INSERT INTO "PaymentProvider" ("id", "name", "type", "isActive", "createdAt", "updatedAt") VALUES
    ('seed_pp_davivienda', 'Davivienda',  'BANK',      true, NOW(), NOW()),
    ('seed_pp_nequi',      'Nequi',       'WALLET',    true, NOW(), NOW()),
    ('seed_pp_bancolombia','Bancolombia', 'BANK',      true, NOW(), NOW()),
    ('seed_pp_stripe',     'Stripe',      'PROCESSOR', true, NOW(), NOW()),
    ('seed_pp_wise',       'Wise',        'PROCESSOR', true, NOW(), NOW()),
    ('seed_pp_hotmart',    'Hotmart',     'PROCESSOR', true, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
