-- Adds PENDING to StudentStatus. Minimal n8n/GHL fichas are created PENDING and
-- flip to ACTIVE when the enrollment contract is signed.
ALTER TYPE "StudentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
