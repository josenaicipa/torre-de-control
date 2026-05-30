-- CreateEnum
CREATE TYPE "DropiMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'WATCHLIST');

-- CreateEnum
CREATE TYPE "DropiFollowUpReason" AS ENUM ('ZERO_SALES', 'DROP', 'HIGH_RETURN', 'LOW_VOLUME', 'TOP_PERFORMER', 'OTHER');

-- CreateEnum
CREATE TYPE "DropiFollowUpStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DropiPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateTable
CREATE TABLE "DropiCommunityMember" (
    "id" TEXT NOT NULL,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "dropiExternalId" TEXT,
    "ghlContactId" TEXT,
    "currentSegment" TEXT,
    "currentPriority" "DropiPriority",
    "currentStatus" "DropiMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstReportedAt" TIMESTAMP(3),
    "lastReportedAt" TIMESTAMP(3),
    "notes" TEXT,
    "linkedStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropiCommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DropiCommunityMember_email_idx" ON "DropiCommunityMember"("email");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_phone_idx" ON "DropiCommunityMember"("phone");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_country_idx" ON "DropiCommunityMember"("country");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_linkedStudentId_idx" ON "DropiCommunityMember"("linkedStudentId");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_currentSegment_idx" ON "DropiCommunityMember"("currentSegment");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_currentPriority_idx" ON "DropiCommunityMember"("currentPriority");

-- CreateIndex
CREATE INDEX "DropiCommunityMember_currentStatus_idx" ON "DropiCommunityMember"("currentStatus");

-- AddForeignKey
ALTER TABLE "DropiCommunityMember" ADD CONSTRAINT "DropiCommunityMember_linkedStudentId_fkey" FOREIGN KEY ("linkedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DropiImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "reportType" TEXT NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "year" INTEGER,
    "month" INTEGER,
    "country" TEXT,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsProcessed" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "errors" JSONB,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropiImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DropiImportBatch_fileHash_key" ON "DropiImportBatch"("fileHash");

-- CreateIndex
CREATE INDEX "DropiImportBatch_reportType_idx" ON "DropiImportBatch"("reportType");

-- CreateIndex
CREATE INDEX "DropiImportBatch_status_idx" ON "DropiImportBatch"("status");

-- CreateIndex
CREATE INDEX "DropiImportBatch_createdAt_idx" ON "DropiImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "DropiImportBatch_uploadedById_idx" ON "DropiImportBatch"("uploadedById");

-- AddForeignKey
ALTER TABLE "DropiImportBatch" ADD CONSTRAINT "DropiImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DropiWeeklyMetric" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "ordersEntered" INTEGER NOT NULL DEFAULT 0,
    "ordersMoved" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "ordersReturned" INTEGER NOT NULL DEFAULT 0,
    "movementRate" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "deliveryRate" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "returnRate" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "previousOrdersEntered" INTEGER,
    "deltaOrdersEntered" INTEGER,
    "deltaOrdersPercent" DECIMAL(8,2),
    "calculatedSegment" TEXT,
    "calculatedPriority" "DropiPriority",
    "country" TEXT,
    "importBatchId" TEXT,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropiWeeklyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DropiWeeklyMetric_memberId_periodStart_periodEnd_key" ON "DropiWeeklyMetric"("memberId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "DropiWeeklyMetric_memberId_idx" ON "DropiWeeklyMetric"("memberId");

-- CreateIndex
CREATE INDEX "DropiWeeklyMetric_periodStart_periodEnd_idx" ON "DropiWeeklyMetric"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "DropiWeeklyMetric_calculatedSegment_idx" ON "DropiWeeklyMetric"("calculatedSegment");

-- CreateIndex
CREATE INDEX "DropiWeeklyMetric_calculatedPriority_idx" ON "DropiWeeklyMetric"("calculatedPriority");

-- CreateIndex
CREATE INDEX "DropiWeeklyMetric_importBatchId_idx" ON "DropiWeeklyMetric"("importBatchId");

-- AddForeignKey
ALTER TABLE "DropiWeeklyMetric" ADD CONSTRAINT "DropiWeeklyMetric_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DropiCommunityMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiWeeklyMetric" ADD CONSTRAINT "DropiWeeklyMetric_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "DropiImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DropiMonthlyMetric" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "ordersEntered" INTEGER NOT NULL DEFAULT 0,
    "ordersMoved" INTEGER NOT NULL DEFAULT 0,
    "ordersDelivered" INTEGER NOT NULL DEFAULT 0,
    "ordersReturned" INTEGER NOT NULL DEFAULT 0,
    "monthOverMonthDelta" DECIMAL(8,2),
    "trend" TEXT,
    "calculatedSegment" TEXT,
    "calculatedPriority" "DropiPriority",
    "country" TEXT,
    "importBatchId" TEXT,
    "rawRow" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropiMonthlyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DropiMonthlyMetric_memberId_year_month_key" ON "DropiMonthlyMetric"("memberId", "year", "month");

-- CreateIndex
CREATE INDEX "DropiMonthlyMetric_memberId_idx" ON "DropiMonthlyMetric"("memberId");

-- CreateIndex
CREATE INDEX "DropiMonthlyMetric_year_month_idx" ON "DropiMonthlyMetric"("year", "month");

-- CreateIndex
CREATE INDEX "DropiMonthlyMetric_trend_idx" ON "DropiMonthlyMetric"("trend");

-- CreateIndex
CREATE INDEX "DropiMonthlyMetric_importBatchId_idx" ON "DropiMonthlyMetric"("importBatchId");

-- AddForeignKey
ALTER TABLE "DropiMonthlyMetric" ADD CONSTRAINT "DropiMonthlyMetric_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DropiCommunityMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiMonthlyMetric" ADD CONSTRAINT "DropiMonthlyMetric_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "DropiImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DropiFollowUp" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" "DropiFollowUpReason" NOT NULL,
    "priority" "DropiPriority" NOT NULL DEFAULT 'P3',
    "status" "DropiFollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "suggestedAction" TEXT,
    "notes" TEXT,
    "result" TEXT,
    "sourceWeeklyMetricId" TEXT,
    "sourceMonthlyMetricId" TEXT,
    "dueDate" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropiFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DropiFollowUp_memberId_idx" ON "DropiFollowUp"("memberId");

-- CreateIndex
CREATE INDEX "DropiFollowUp_reason_idx" ON "DropiFollowUp"("reason");

-- CreateIndex
CREATE INDEX "DropiFollowUp_status_idx" ON "DropiFollowUp"("status");

-- CreateIndex
CREATE INDEX "DropiFollowUp_priority_idx" ON "DropiFollowUp"("priority");

-- CreateIndex
CREATE INDEX "DropiFollowUp_assignedToId_idx" ON "DropiFollowUp"("assignedToId");

-- CreateIndex
CREATE INDEX "DropiFollowUp_dueDate_idx" ON "DropiFollowUp"("dueDate");

-- AddForeignKey
ALTER TABLE "DropiFollowUp" ADD CONSTRAINT "DropiFollowUp_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DropiCommunityMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiFollowUp" ADD CONSTRAINT "DropiFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiFollowUp" ADD CONSTRAINT "DropiFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "DropiStudentLinkAudit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT,
    "studentId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DropiStudentLinkAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DropiStudentLinkAudit_memberId_idx" ON "DropiStudentLinkAudit"("memberId");

-- CreateIndex
CREATE INDEX "DropiStudentLinkAudit_studentId_idx" ON "DropiStudentLinkAudit"("studentId");

-- CreateIndex
CREATE INDEX "DropiStudentLinkAudit_createdAt_idx" ON "DropiStudentLinkAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "DropiStudentLinkAudit" ADD CONSTRAINT "DropiStudentLinkAudit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "DropiCommunityMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiStudentLinkAudit" ADD CONSTRAINT "DropiStudentLinkAudit_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DropiStudentLinkAudit" ADD CONSTRAINT "DropiStudentLinkAudit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
