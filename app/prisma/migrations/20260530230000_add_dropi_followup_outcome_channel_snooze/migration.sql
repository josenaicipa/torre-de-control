-- Phase B step 1 for Comunidad Dropi seguimientos: structured outcome of the
-- last contact round, channel used, and a snooze that defers a case without
-- touching its dueDate. All new columns are nullable so existing rows survive
-- the migration with no backfill.

-- CreateEnum
CREATE TYPE "DropiFollowUpOutcome" AS ENUM (
  'ANSWERED',
  'NO_ANSWER',
  'INTERESTED',
  'NOT_INTERESTED',
  'SCHEDULED',
  'NO_REPLY',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "DropiContactChannel" AS ENUM (
  'WHATSAPP',
  'CALL',
  'EMAIL',
  'OTHER'
);

-- AlterTable
ALTER TABLE "DropiFollowUp"
  ADD COLUMN "outcome" "DropiFollowUpOutcome",
  ADD COLUMN "contactChannel" "DropiContactChannel",
  ADD COLUMN "snoozedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DropiFollowUp_outcome_idx" ON "DropiFollowUp"("outcome");

-- CreateIndex
CREATE INDEX "DropiFollowUp_contactChannel_idx" ON "DropiFollowUp"("contactChannel");

-- CreateIndex
CREATE INDEX "DropiFollowUp_snoozedUntil_idx" ON "DropiFollowUp"("snoozedUntil");
