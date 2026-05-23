-- Step 1: Drop FK and index from Student
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_programId_fkey";
DROP INDEX IF EXISTS "Student_programId_idx";

-- Step 2: Drop column from Student
ALTER TABLE "Student" DROP COLUMN IF EXISTS "programId";

-- Step 3: Drop Program table entirely
DROP TABLE IF EXISTS "Program";
