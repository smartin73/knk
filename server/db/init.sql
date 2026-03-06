-- ═══════════════════════════════════════════════════════════
--  Knife & Knead — Database Schema
--  All tables use UUID primary keys and audit timestamps
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Utility: auto-update updated_at ──────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════
--  MODULE 1: EVENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE event_vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name   TEXT NOT NULL,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  logo_url      TEXT,
  map_embed     TEXT,
  website_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID REFERENCES event_vendors(id) ON DELETE SET NULL,
  event_name    TEXT NOT NULL,
  event_date    DATE,
  start_time    TIME,
  end_time      TIME,
  location      TEXT,
  description   TEXT,
  image_url     TEXT,
  ticket_url    TEXT,
  map_embed     TEXT,
  category      TEXT,
  tags          TEXT,
  price         TEXT,
  status        TEXT DEFAULT 'draft',   -- draft | published | cancelled
  posted_to_web BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 2: RECIPES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE recipes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_name       TEXT NOT NULL,
  recipe_type       TEXT,
  description       TEXT,
  serving_size      INTEGER,
  prep_time         TEXT,
  cook_time         TEXT,
  folds_required    INTEGER DEFAULT 0,
  image_url         TEXT,
  ingredient_label  TEXT,
  contains_label    TEXT,
  square_id         TEXT,
  woo_id            TEXT,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipe_steps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id             UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number           INTEGER NOT NULL,
  step_description      TEXT NOT NULL,
  step_time             INTERVAL,
  requires_notification BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredient_items(id) ON DELETE SET NULL,
  ingredient    TEXT NOT NULL,
  amount        NUMERIC(10,4),
  measurement   TEXT,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 3: INGREDIENTS & INVENTORY
-- ═══════════════════════════════════════════════════════════

CREATE TABLE ingredient_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name       TEXT NOT NULL,
  purchase_from   TEXT,
  grams           NUMERIC(10,4),
  current_price   NUMERIC(10,4),
  cost_per_gram   NUMERIC(10,6) GENERATED ALWAYS AS (
    CASE WHEN grams > 0 THEN current_price / grams ELSE 0 END
  ) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingredient_price_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id   UUID NOT NULL REFERENCES ingredient_items(id) ON DELETE CASCADE,
  price           NUMERIC(10,4) NOT NULL,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE freezer_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
  item_builder_id UUID,  -- FK added after item_builder table created
  item_count      INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 2 (cont): ITEM BUILDER
--  (depends on recipes, so defined after)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE item_builder (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id               UUID REFERENCES recipes(id) ON DELETE SET NULL,
  item_name               TEXT NOT NULL,
  description             TEXT,
  batch_qty               INTEGER DEFAULT 1,
  retail_price            NUMERIC(10,2),
  include_packaging       BOOLEAN DEFAULT FALSE,
  include_fees            BOOLEAN DEFAULT FALSE,
  food_cook_time          INTERVAL,
  ingredient_label        TEXT,
  contains_label          TEXT,
  image_url               TEXT,
  square_id               TEXT,
  woo_id                  TEXT,
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Now we can add the FK on freezer_inventory
ALTER TABLE freezer_inventory
  ADD CONSTRAINT fk_freezer_item_builder
  FOREIGN KEY (item_builder_id) REFERENCES item_builder(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════
--  MODULE 4: EVENT MENUS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE event_menus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_date          DATE,
  start_time          TIME,
  end_time            TIME,
  gluten_free_avail   BOOLEAN DEFAULT FALSE,
  notes               TEXT,
  is_processed        BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_menu_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id           UUID NOT NULL REFERENCES event_menus(id) ON DELETE CASCADE,
  item_builder_id   UUID REFERENCES item_builder(id) ON DELETE SET NULL,
  item_name         TEXT NOT NULL,
  item_description  TEXT,
  price             NUMERIC(10,2),
  qty_made          INTEGER DEFAULT 0,
  qty_sold          INTEGER DEFAULT 0,
  is_limited        BOOLEAN DEFAULT FALSE,
  is_sold_out       BOOLEAN DEFAULT FALSE,
  is_special        BOOLEAN DEFAULT FALSE,
  fee               NUMERIC(10,2) DEFAULT 0,
  packaging         NUMERIC(10,2) DEFAULT 0,
  image_url         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 5: SALES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE square_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_order_id TEXT UNIQUE NOT NULL,
  status          TEXT,
  payment_type    TEXT,
  channel         TEXT,
  total           NUMERIC(10,2),
  discount        NUMERIC(10,2) DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE square_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES square_orders(id) ON DELETE CASCADE,
  item_builder_id UUID REFERENCES item_builder(id) ON DELETE SET NULL,
  recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
  square_item_id  TEXT,
  item_name       TEXT,
  category_id     TEXT,
  qty             INTEGER DEFAULT 1,
  unit_cost       NUMERIC(10,2),
  unit_retail     NUMERIC(10,2),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE woo_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id    TEXT UNIQUE NOT NULL,
  order_date      DATE,
  status          TEXT,
  total           NUMERIC(10,2),
  payment_type    TEXT,
  customer_note   TEXT,
  completed_at    DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE woo_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES woo_orders(id) ON DELETE CASCADE,
  item_builder_id UUID REFERENCES item_builder(id) ON DELETE SET NULL,
  recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
  woo_item_id     TEXT,
  item_name       TEXT,
  variations      TEXT,
  qty             INTEGER DEFAULT 1,
  unit_cost       NUMERIC(10,2),
  unit_retail     NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 6: FINANCE
-- ═══════════════════════════════════════════════════════════

CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address1    TEXT,
  address2    TEXT,
  city        TEXT,
  state       TEXT,
  zip         TEXT,
  email       TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  SERIAL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  invoice_date    DATE DEFAULT CURRENT_DATE,
  due_date        DATE,
  terms           TEXT,
  taxable         BOOLEAN DEFAULT FALSE,
  tax_rate        NUMERIC(5,4) DEFAULT 0,
  notes           TEXT,
  status          TEXT DEFAULT 'draft',  -- draft | sent | paid | void
  added_to_income BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_number     TEXT,
  description     TEXT NOT NULL,
  qty             NUMERIC(10,2) DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE income_expense_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date  DATE NOT NULL,
  year        INTEGER GENERATED ALWAYS AS (EXTRACT(YEAR FROM entry_date)::INTEGER) STORED,
  category    TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  source      TEXT,  -- square | woo | invoice | manual
  reference   UUID,  -- optional FK to orders/invoices
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  MODULE 7: DONATIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE donations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  donor_name  TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  donated_at  DATE DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  USERS (app login)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: auto-update updated_at on all tables
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'event_vendors','events','recipes','recipe_steps','recipe_ingredients',
    'ingredient_items','freezer_inventory','item_builder',
    'event_menus','event_menu_items',
    'square_orders','square_order_items','woo_orders','woo_order_items',
    'customers','invoices','income_expense_entries','donations','users'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  INDEXES
-- ═══════════════════════════════════════════════════════════

CREATE INDEX idx_events_date         ON events(event_date);
CREATE INDEX idx_events_status       ON events(status);
CREATE INDEX idx_recipes_type        ON recipes(recipe_type);
CREATE INDEX idx_recipe_steps_recipe ON recipe_steps(recipe_id, step_number);
CREATE INDEX idx_recipe_ing_recipe   ON recipe_ingredients(recipe_id);
CREATE INDEX idx_item_builder_recipe ON item_builder(recipe_id);
CREATE INDEX idx_emi_menu            ON event_menu_items(menu_id);
CREATE INDEX idx_sq_items_order      ON square_order_items(order_id);
CREATE INDEX idx_woo_items_order     ON woo_order_items(order_id);
CREATE INDEX idx_income_year         ON income_expense_entries(year, type);
CREATE INDEX idx_donations_event     ON donations(event_id);
