ALTER TABLE ingredient_items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
