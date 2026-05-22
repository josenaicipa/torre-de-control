-- CreateTable
CREATE TABLE "dashboard_payment_transactions" (
    "id" TEXT NOT NULL,
    "externalTransactionId" TEXT,
    "source" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "leadName" TEXT,
    "leadEmail" TEXT,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "amountOriginal" DECIMAL(18,2),
    "currency" TEXT,
    "product" TEXT,
    "offerName" TEXT,
    "paymentType" TEXT,
    "buyerType" TEXT,
    "classification" TEXT NOT NULL,
    "contributesToCash" BOOLEAN NOT NULL DEFAULT true,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "raw" JSONB,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_payment_transactions_paidAt_idx" ON "dashboard_payment_transactions"("paidAt");

-- CreateIndex
CREATE INDEX "dashboard_payment_transactions_classification_idx" ON "dashboard_payment_transactions"("classification");

-- CreateIndex
CREATE INDEX "dashboard_payment_transactions_source_idx" ON "dashboard_payment_transactions"("source");

-- CreateIndex
CREATE INDEX "dashboard_payment_transactions_reviewRequired_idx" ON "dashboard_payment_transactions"("reviewRequired");

-- CreateIndex
CREATE INDEX "dashboard_payment_transactions_leadEmail_idx" ON "dashboard_payment_transactions"("leadEmail");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_payment_transactions_source_externalTransactionId_key" ON "dashboard_payment_transactions"("source", "externalTransactionId");
