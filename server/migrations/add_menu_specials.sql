-- Add is_special flag to event_menu_items
ALTER TABLE event_menu_items ADD COLUMN is_special boolean DEFAULT false;
