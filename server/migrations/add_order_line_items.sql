CREATE TABLE IF NOT EXISTS order_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  square_order_id text NOT NULL,
  item_builder_id uuid REFERENCES item_builder(id) ON DELETE SET NULL,
  item_name       text,
  quantity        numeric,
  unit_price      numeric,
  total           numeric,
  sale_date       date,
  event_id        uuid REFERENCES events(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_line_items_order_item_uidx
  ON order_line_items (square_order_id, item_name);
