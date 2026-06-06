-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "importBatchId" TEXT;

-- CreateIndex
CREATE INDEX "Student_importBatchId_idx" ON "Student"("importBatchId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
