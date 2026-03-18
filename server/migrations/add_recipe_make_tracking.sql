-- Link recipes to their output item_builder item
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS item_builder_id UUID REFERENCES item_builder(id);

-- Track each time a recipe is made
CREATE TABLE IF NOT EXISTS recipe_makes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  multiplier     NUMERIC NOT NULL DEFAULT 1,
  yield_qty      NUMERIC,
  item_builder_id UUID REFERENCES item_builder(id),
  notes          TEXT,
  made_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
