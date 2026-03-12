-- Recipe test tracking / version history
-- Run on DB server: psql -U knkdb -d knk -f add_recipe_tests.sql

CREATE TABLE recipe_tests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id      uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  test_number    integer NOT NULL,
  label          text,
  stage          varchar(20) DEFAULT 'testing',
  tested_at      date NOT NULL DEFAULT CURRENT_DATE,
  outcome        varchar(20) DEFAULT 'pending',  -- pending | success | needs_work | fail
  rating         integer CHECK (rating BETWEEN 1 AND 5),
  tasting_notes  text,
  crumb_notes    text,
  crust_notes    text,
  observations   text,
  is_promoted    boolean DEFAULT false,
  promoted_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (recipe_id, test_number)
);

CREATE TABLE recipe_test_steps (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id               uuid NOT NULL REFERENCES recipe_tests(id) ON DELETE CASCADE,
  step_number           integer NOT NULL,
  step_type             text DEFAULT 'regular',
  step_description      text,
  step_time             text,
  requires_notification boolean DEFAULT false,
  fold_type             text,
  fold_interval         text,
  temp_min              numeric,
  temp_max              numeric
);

CREATE TABLE recipe_test_ingredients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id        uuid NOT NULL REFERENCES recipe_tests(id) ON DELETE CASCADE,
  ingredient_id  uuid REFERENCES ingredient_items(id),
  ingredient     text,
  amount         numeric,
  measurement    text,
  sort_order     integer DEFAULT 0
);
