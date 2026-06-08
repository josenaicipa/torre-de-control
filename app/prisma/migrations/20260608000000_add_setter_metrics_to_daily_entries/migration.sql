-- Add explicit nullable setter metrics to the manual collaborator dashboard rows.
-- Existing rows remain valid; browser code falls back to legacy reused columns when
-- these values are still NULL.
ALTER TABLE "daily_entries"
  ADD COLUMN "setter_new_conversations" INTEGER,
  ADD COLUMN "setter_new_inbound" INTEGER,
  ADD COLUMN "setter_new_outbound" INTEGER,
  ADD COLUMN "setter_outbound_replies" INTEGER,
  ADD COLUMN "setter_calls_proposed" INTEGER,
  ADD COLUMN "setter_links_sent" INTEGER;
