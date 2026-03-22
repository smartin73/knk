-- Add account column to income_entries for FileMaker import and manual categorisation
ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS account text;
