-- AlterTable
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "contractSignatureToken" TEXT,
ADD COLUMN     "contractSignatureTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN     "contractSignerName" TEXT,
ADD COLUMN     "contractSignedIp" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudentProductEnrollment_contractSignatureToken_key" ON "StudentProductEnrollment"("contractSignatureToken");
