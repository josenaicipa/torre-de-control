-- Harden dashboard RBAC defaults and legacy rows.
-- New non-admin users must start fail-closed (OWN + explicit permissions), while
-- admins remain explicitly global.

ALTER TABLE "User" ALTER COLUMN "dataScope" SET DEFAULT 'OWN';

-- Existing admins are intentionally global and admin-positioned.
UPDATE "User"
SET "position" = 'ADMIN', "dataScope" = 'ALL'
WHERE "role" = 'ADMIN';

-- Existing non-admin rows inherited ALL from the initial migration default. Move
-- them to OWN so aggregate/company-wide data is not visible by default.
UPDATE "User"
SET "dataScope" = 'OWN'
WHERE "role" <> 'ADMIN' AND "dataScope" = 'ALL';

-- Preserve basic dashboard access for active legacy non-admin users that had an
-- empty permission array, but keep it scoped by the corrected dataScope above.
UPDATE "User"
SET "permissions" = ARRAY['dashboard.read','reports.read']::text[]
WHERE "role" <> 'ADMIN'
  AND "active" = true
  AND cardinality("permissions") = 0;
