-- CreateEnum
CREATE TYPE "ProductSaleLimit" AS ENUM ('ONE_PER_STUDENT', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'SYNC_ERROR');

-- CreateEnum
CREATE TYPE "MentorshipStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "TagAssignmentSource" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "InitialPaymentType" AS ENUM ('FULL_PAYMENT', 'DOWN_PAYMENT', 'RESERVATION');

-- CreateEnum
CREATE TYPE "LearnWorldsAccessType" AS ENUM ('COURSE', 'BUNDLE', 'SUBSCRIPTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StudentStatus" ADD VALUE 'SEPARATED';
ALTER TYPE "StudentStatus" ADD VALUE 'INACTIVE';
ALTER TYPE "StudentStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "accessStatus" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "mentorshipStatus" "MentorshipStatus" NOT NULL DEFAULT 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "PaymentSchedule" ADD COLUMN     "enrollmentId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(18,8),
ADD COLUMN     "initialPaymentType" "InitialPaymentType",
ADD COLUMN     "isInitialPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "officialAmountUsd" DECIMAL(14,2),
ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "receivedAmount" DECIMAL(14,2),
ADD COLUMN     "receivedCurrency" TEXT;

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "basePriceUsd" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "saleLimit" "ProductSaleLimit" NOT NULL DEFAULT 'ONE_PER_STUDENT',
    "allowsInstallments" BOOLEAN NOT NULL DEFAULT true,
    "requiresInitialPayment" BOOLEAN NOT NULL DEFAULT false,
    "generatesCommission" BOOLEAN NOT NULL DEFAULT false,
    "defaultCommissionPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "isMainProduct" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProductEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATE NOT NULL,
    "endsAt" DATE,
    "totalAmountUsd" DECIMAL(14,2) NOT NULL,
    "initialPaymentUsd" DECIMAL(14,2),
    "balanceUsd" DECIMAL(14,2),
    "installmentCount" INTEGER,
    "commissionBaseUsd" DECIMAL(14,2),
    "commissionPercent" DECIMAL(6,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentAccountId" TEXT,
    "accessStatus" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "accessGrantedAt" TIMESTAMP(3),
    "learnWorldsSyncStatus" TEXT NOT NULL DEFAULT 'pending',
    "learnWorldsSyncError" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProductEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "ownerName" TEXT,
    "providerName" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "allowAutomaticAssignment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentTagAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "source" "TagAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerStudentId" TEXT NOT NULL,
    "referredStudentId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentReferralCommission" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "splitPercent" DECIMAL(6,2) NOT NULL,
    "commissionBaseUsd" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentReferralCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnWorldsAccessConfig" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lwProductType" "LearnWorldsAccessType" NOT NULL,
    "lwExternalId" TEXT NOT NULL,
    "lwDisplayName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnWorldsAccessConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_isMainProduct_idx" ON "Product"("isMainProduct");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_studentId_idx" ON "StudentProductEnrollment"("studentId");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_productId_idx" ON "StudentProductEnrollment"("productId");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_status_idx" ON "StudentProductEnrollment"("status");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_paymentAccountId_idx" ON "StudentProductEnrollment"("paymentAccountId");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_accessStatus_idx" ON "StudentProductEnrollment"("accessStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccount_displayName_key" ON "PaymentAccount"("displayName");

-- CreateIndex
CREATE INDEX "PaymentAccount_isActive_idx" ON "PaymentAccount"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTag_name_key" ON "StudentTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTag_slug_key" ON "StudentTag"("slug");

-- CreateIndex
CREATE INDEX "StudentTag_isActive_idx" ON "StudentTag"("isActive");

-- CreateIndex
CREATE INDEX "StudentTag_allowAutomaticAssignment_idx" ON "StudentTag"("allowAutomaticAssignment");

-- CreateIndex
CREATE INDEX "StudentTagAssignment_studentId_idx" ON "StudentTagAssignment"("studentId");

-- CreateIndex
CREATE INDEX "StudentTagAssignment_tagId_idx" ON "StudentTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "StudentTagAssignment_source_idx" ON "StudentTagAssignment"("source");

-- CreateIndex
CREATE UNIQUE INDEX "StudentTagAssignment_studentId_tagId_key" ON "StudentTagAssignment"("studentId", "tagId");

-- CreateIndex
CREATE INDEX "Referral_referrerStudentId_idx" ON "Referral"("referrerStudentId");

-- CreateIndex
CREATE INDEX "Referral_referredStudentId_idx" ON "Referral"("referredStudentId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referrerStudentId_referredStudentId_key" ON "Referral"("referrerStudentId", "referredStudentId");

-- CreateIndex
CREATE INDEX "EnrollmentReferralCommission_enrollmentId_idx" ON "EnrollmentReferralCommission"("enrollmentId");

-- CreateIndex
CREATE INDEX "EnrollmentReferralCommission_referralId_idx" ON "EnrollmentReferralCommission"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentReferralCommission_enrollmentId_referralId_key" ON "EnrollmentReferralCommission"("enrollmentId", "referralId");

-- CreateIndex
CREATE INDEX "LearnWorldsAccessConfig_productId_idx" ON "LearnWorldsAccessConfig"("productId");

-- CreateIndex
CREATE INDEX "LearnWorldsAccessConfig_lwProductType_idx" ON "LearnWorldsAccessConfig"("lwProductType");

-- CreateIndex
CREATE INDEX "LearnWorldsAccessConfig_isActive_idx" ON "LearnWorldsAccessConfig"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LearnWorldsAccessConfig_productId_lwExternalId_key" ON "LearnWorldsAccessConfig"("productId", "lwExternalId");

-- CreateIndex
CREATE INDEX "Student_mentorshipStatus_idx" ON "Student"("mentorshipStatus");

-- CreateIndex
CREATE INDEX "Student_accessStatus_idx" ON "Student"("accessStatus");

-- CreateIndex
CREATE INDEX "PaymentSchedule_enrollmentId_idx" ON "PaymentSchedule"("enrollmentId");

-- CreateIndex
CREATE INDEX "Payment_enrollmentId_idx" ON "Payment"("enrollmentId");

-- CreateIndex
CREATE INDEX "Payment_paymentAccountId_idx" ON "Payment"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentProductEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentProductEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTagAssignment" ADD CONSTRAINT "StudentTagAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTagAssignment" ADD CONSTRAINT "StudentTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StudentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerStudentId_fkey" FOREIGN KEY ("referrerStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredStudentId_fkey" FOREIGN KEY ("referredStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentReferralCommission" ADD CONSTRAINT "EnrollmentReferralCommission_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentProductEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentReferralCommission" ADD CONSTRAINT "EnrollmentReferralCommission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnWorldsAccessConfig" ADD CONSTRAINT "LearnWorldsAccessConfig_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

