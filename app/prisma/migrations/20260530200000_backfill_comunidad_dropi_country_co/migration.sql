-- Backfill country='CO' for Comunidad Dropi records that were imported before
-- the country defaulting fix. Only rows with a missing country (NULL or empty
-- string) are touched; any explicit country code is preserved.
--
-- Safe to re-run: the WHERE clauses match nothing once the data is healed.

UPDATE "DropiCommunityMember"
SET "country" = 'CO'
WHERE "country" IS NULL OR "country" = '';

UPDATE "DropiWeeklyMetric"
SET "country" = 'CO'
WHERE "country" IS NULL OR "country" = '';

UPDATE "DropiMonthlyMetric"
SET "country" = 'CO'
WHERE "country" IS NULL OR "country" = '';

UPDATE "DropiImportBatch"
SET "country" = 'CO'
WHERE "country" IS NULL OR "country" = '';
