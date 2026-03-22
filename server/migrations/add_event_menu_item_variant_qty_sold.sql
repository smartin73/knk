-- Add variant_id and qty_sold to event_menu_items for historical FM import
ALTER TABLE event_menu_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES item_variants(id) ON DELETE SET NULL;

ALTER TABLE event_menu_items
  ADD COLUMN IF NOT EXISTS qty_sold integer DEFAULT 0;
