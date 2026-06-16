-- Datos legales mínimos del estudiante para el contrato de inscripción real.
ALTER TABLE "Student" ADD COLUMN     "documentType" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "legalCity" TEXT,
ADD COLUMN     "legalCountry" TEXT;

-- Evidencia de firma electrónica del estudiante y firma del CEO en la inscripción.
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "contractSignedUserAgent" TEXT,
ADD COLUMN     "contractTemplateVersion" TEXT,
ADD COLUMN     "contractAcceptanceText" TEXT,
ADD COLUMN     "contractStudentSignatureHash" TEXT,
ADD COLUMN     "contractCeoSignerName" TEXT,
ADD COLUMN     "contractCeoSignedAt" TIMESTAMP(3),
ADD COLUMN     "contractCeoSignedById" TEXT,
ADD COLUMN     "contractCeoSignatureHash" TEXT;

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_contractCeoSignedById_idx" ON "StudentProductEnrollment"("contractCeoSignedById");

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_contractCeoSignedById_fkey" FOREIGN KEY ("contractCeoSignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
