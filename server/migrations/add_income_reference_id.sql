-- Add reference_id to income_entries for idempotent Square webhook inserts
ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- Unique index (partial) so duplicate webhooks for the same payment are safely rejected
CREATE UNIQUE INDEX IF NOT EXISTS income_entries_reference_id_uidx
  ON income_entries (reference_id)
  WHERE reference_id IS NOT NULL;
