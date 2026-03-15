-- Rebuild donations table: replace donor_name/amount model with item-based model
ALTER TABLE donations DROP COLUMN IF EXISTS donor_name;
ALTER TABLE donations DROP COLUMN IF EXISTS amount;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS item_builder_id uuid REFERENCES item_builder(id);
ALTER TABLE donations ADD COLUMN IF NOT EXISTS quantity numeric NOT NULL DEFAULT 1;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS unit_value numeric NOT NULL DEFAULT 0;
