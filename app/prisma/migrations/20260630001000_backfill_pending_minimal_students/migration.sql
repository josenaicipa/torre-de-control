-- Backfill: minimal n8n/GHL fichas that were created INACTIVE with an assumed
-- duration should surface as PENDING (awaiting contract signature). Real/manual
-- inactive students (durationAssumed = false) are left untouched.
UPDATE "Student"
SET "status" = 'PENDING'
WHERE "status" = 'INACTIVE' AND "durationAssumed" = true;
