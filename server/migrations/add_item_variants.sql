CREATE TABLE IF NOT EXISTS item_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_builder_id uuid NOT NULL REFERENCES item_builder(id) ON DELETE CASCADE,
  variant_name    text NOT NULL,
  price_override  numeric,
  square_id       text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
