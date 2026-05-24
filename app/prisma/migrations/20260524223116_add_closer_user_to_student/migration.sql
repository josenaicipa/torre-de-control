-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "closerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Student_closerUserId_idx" ON "Student"("closerUserId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_closerUserId_fkey" FOREIGN KEY ("closerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
