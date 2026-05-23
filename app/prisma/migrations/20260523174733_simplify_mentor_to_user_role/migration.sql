-- Step 1: Add new columns mentorUserId (nullable for migration, will keep nullable in Student, NOT NULL in ProgressUpdate)
ALTER TABLE "Student" ADD COLUMN "mentorUserId" TEXT;
ALTER TABLE "ProgressUpdate" ADD COLUMN "mentorUserId" TEXT;

-- Step 2: Migrate existing data - for each Student/ProgressUpdate that references a Mentor that had a userId, copy the userId
UPDATE "Student" s
SET "mentorUserId" = m."userId"
FROM "Mentor" m
WHERE s."mentorId" = m.id AND m."userId" IS NOT NULL;

UPDATE "ProgressUpdate" p
SET "mentorUserId" = m."userId"
FROM "Mentor" m
WHERE p."mentorId" = m.id AND m."userId" IS NOT NULL;

-- Step 3: Drop old foreign keys and columns
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_mentorId_fkey";
DROP INDEX IF EXISTS "Student_mentorId_idx";
ALTER TABLE "Student" DROP COLUMN "mentorId";

ALTER TABLE "ProgressUpdate" DROP CONSTRAINT IF EXISTS "ProgressUpdate_mentorId_fkey";
DROP INDEX IF EXISTS "ProgressUpdate_mentorId_idx";
ALTER TABLE "ProgressUpdate" DROP COLUMN "mentorId";

-- Step 4: ProgressUpdate.mentorUserId should be NOT NULL (every progress update must have a mentor)
-- Only enforce if all rows have non-null (after migration); if there is NULL data, fail loudly
ALTER TABLE "ProgressUpdate" ALTER COLUMN "mentorUserId" SET NOT NULL;

-- Step 5: Add new foreign keys
ALTER TABLE "Student" ADD CONSTRAINT "Student_mentorUserId_fkey"
  FOREIGN KEY ("mentorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_mentorUserId_fkey"
  FOREIGN KEY ("mentorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 6: Add new indexes
CREATE INDEX "Student_mentorUserId_idx" ON "Student"("mentorUserId");
CREATE INDEX "ProgressUpdate_mentorUserId_idx" ON "ProgressUpdate"("mentorUserId");

-- Step 7: Drop Mentor table
DROP TABLE "Mentor";
