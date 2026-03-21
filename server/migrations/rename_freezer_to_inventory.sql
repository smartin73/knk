-- Rename freezer_qty to inventory_qty on item_builder
ALTER TABLE item_builder RENAME COLUMN freezer_qty TO inventory_qty;
