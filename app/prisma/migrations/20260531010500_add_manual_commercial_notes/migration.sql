ALTER TABLE "daily_entries"
  ADD COLUMN IF NOT EXISTS "showup_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "hot_leads_evidence" TEXT,
  ADD COLUMN IF NOT EXISTS "blockers" TEXT,
  ADD COLUMN IF NOT EXISTS "setter_findings" TEXT;
