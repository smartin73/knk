-- Event Menus: display menus for events (tablet display at the event)
-- Run on DB server: sudo -u postgres psql -d knk -f add_event_menus.sql

-- Drop old scaffolded tables (no client UI existed, no real data)
DROP TABLE IF EXISTS event_menu_items CASCADE;
DROP TABLE IF EXISTS event_menus CASCADE;

-- A menu is tied to an Event and displayed on a tablet at the event
CREATE TABLE event_menus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid REFERENCES events(id) ON DELETE SET NULL,
  menu_name      text NOT NULL,
  tagline        text,
  tagline_color  varchar(20) DEFAULT '#e85d26',
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

-- Items on a menu — sourced from Item Builder
-- Status is computed: qty=0 → sold_out, 0<qty≤threshold → limited, else → available
CREATE TABLE event_menu_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id           uuid NOT NULL REFERENCES event_menus(id) ON DELETE CASCADE,
  item_builder_id   uuid REFERENCES item_builder(id) ON DELETE SET NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  qty_on_hand       integer NOT NULL DEFAULT 0,
  limited_threshold integer NOT NULL DEFAULT 3,
  created_at        timestamptz DEFAULT now()
);
