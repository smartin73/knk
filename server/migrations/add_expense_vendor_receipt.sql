ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS receipt_url TEXT;
