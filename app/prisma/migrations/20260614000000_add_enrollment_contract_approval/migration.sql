-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "contractStatus" "ContractStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
ADD COLUMN     "contractUrl" TEXT,
ADD COLUMN     "contractSignedAt" TIMESTAMP(3),
ADD COLUMN     "contractApprovedAt" TIMESTAMP(3),
ADD COLUMN     "contractApprovedById" TEXT,
ADD COLUMN     "contractRejectedAt" TIMESTAMP(3),
ADD COLUMN     "contractRejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_contractStatus_idx" ON "StudentProductEnrollment"("contractStatus");

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_contractApprovedById_idx" ON "StudentProductEnrollment"("contractApprovedById");

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_contractApprovedById_fkey" FOREIGN KEY ("contractApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
