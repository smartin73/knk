-- Add woo_id to events (stores WordPress Simple Events post ID)
ALTER TABLE events ADD COLUMN IF NOT EXISTS woo_id TEXT;

-- Add woo_id to item_builder (stores WooCommerce product ID)
ALTER TABLE item_builder ADD COLUMN IF NOT EXISTS woo_id TEXT;
