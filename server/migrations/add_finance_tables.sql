CREATE TABLE IF NOT EXISTS income_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('square', 'website', 'manual')),
  amount      numeric NOT NULL,
  date        date NOT NULL,
  event_id    uuid REFERENCES events(id) ON DELETE SET NULL,
  description text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL,
  amount      numeric NOT NULL,
  date        date NOT NULL,
  description text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
