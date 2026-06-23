-- CreateEnum
CREATE TYPE "SignatureFlowStatus" AS ENUM ('NOT_SENT', 'PENDING_SIGNATURES', 'STUDENT_SIGNED', 'COMPLETED', 'PDF_STORED', 'DRIVE_UPLOADED', 'DOCUSEAL_ERROR', 'DRIVE_ERROR');

-- AlterTable Product: configurable program metadata
ALTER TABLE "Product" ADD COLUMN     "programLevel" INTEGER,
    ADD COLUMN     "displayOrder" INTEGER,
    ADD COLUMN     "contractDisplayName" TEXT,
    ADD COLUMN     "includesAdvancedClasses" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable Student: Google Drive folder created by n8n
ALTER TABLE "Student" ADD COLUMN     "driveFolderId" TEXT,
    ADD COLUMN     "driveFolderUrl" TEXT,
    ADD COLUMN     "driveFolderSource" TEXT,
    ADD COLUMN     "driveFolderSyncedAt" TIMESTAMP(3),
    ADD COLUMN     "driveFolderSyncStatus" TEXT,
    ADD COLUMN     "driveFolderSyncError" TEXT;

-- AlterTable StudentProductEnrollment: program snapshot, upgrades, DocuSeal, signed PDF
ALTER TABLE "StudentProductEnrollment" ADD COLUMN     "programLevelSnapshot" INTEGER,
    ADD COLUMN     "productNameSnapshot" TEXT,
    ADD COLUMN     "grossProgramPriceUsd" DECIMAL(14,2),
    ADD COLUMN     "upgradeFromEnrollmentId" TEXT,
    ADD COLUMN     "upgradeCreditUsd" DECIMAL(14,2),
    ADD COLUMN     "netAmountUsd" DECIMAL(14,2),
    ADD COLUMN     "docusealSubmissionId" TEXT,
    ADD COLUMN     "docusealStatus" TEXT,
    ADD COLUMN     "signatureFlowStatus" "SignatureFlowStatus" NOT NULL DEFAULT 'NOT_SENT',
    ADD COLUMN     "studentSignedAt" TIMESTAMP(3),
    ADD COLUMN     "companySignedAt" TIMESTAMP(3),
    ADD COLUMN     "docusealCompletedAt" TIMESTAMP(3),
    ADD COLUMN     "signedPdfStoredAt" TIMESTAMP(3),
    ADD COLUMN     "signedPdfFilePath" TEXT,
    ADD COLUMN     "signedPdfContent" TEXT,
    ADD COLUMN     "signedPdfDriveFileId" TEXT,
    ADD COLUMN     "signedPdfDriveUrl" TEXT,
    ADD COLUMN     "signedPdfDriveUploadedAt" TIMESTAMP(3),
    ADD COLUMN     "signedPdfDriveUploadStatus" TEXT,
    ADD COLUMN     "signedPdfDriveUploadError" TEXT;

-- CreateTable PendingDriveFolderEvent
CREATE TABLE "PendingDriveFolderEvent" (
    "id" TEXT NOT NULL,
    "studentEmail" TEXT,
    "studentPhone" TEXT,
    "ghlContactId" TEXT,
    "driveFolderId" TEXT NOT NULL,
    "driveFolderUrl" TEXT,
    "rawPayload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedStudentId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingDriveFolderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentProductEnrollment_upgradeFromEnrollmentId_idx" ON "StudentProductEnrollment"("upgradeFromEnrollmentId");
CREATE INDEX "StudentProductEnrollment_docusealSubmissionId_idx" ON "StudentProductEnrollment"("docusealSubmissionId");
CREATE INDEX "StudentProductEnrollment_signatureFlowStatus_idx" ON "StudentProductEnrollment"("signatureFlowStatus");
CREATE INDEX "PendingDriveFolderEvent_studentEmail_idx" ON "PendingDriveFolderEvent"("studentEmail");
CREATE INDEX "PendingDriveFolderEvent_studentPhone_idx" ON "PendingDriveFolderEvent"("studentPhone");
CREATE INDEX "PendingDriveFolderEvent_ghlContactId_idx" ON "PendingDriveFolderEvent"("ghlContactId");
CREATE INDEX "PendingDriveFolderEvent_resolvedAt_idx" ON "PendingDriveFolderEvent"("resolvedAt");

-- AddForeignKey
ALTER TABLE "StudentProductEnrollment" ADD CONSTRAINT "StudentProductEnrollment_upgradeFromEnrollmentId_fkey" FOREIGN KEY ("upgradeFromEnrollmentId") REFERENCES "StudentProductEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
