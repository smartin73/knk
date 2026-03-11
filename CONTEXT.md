# Knife & Knead (knk) — Project Context

## Overview
Internal business management web app replacing FileMaker. Solo operator project.
Live at: `https://app.knifeandknead.com`

---

## Infrastructure

| Component | Details |
|-----------|---------|
| App server | Ubuntu 24, `knk1@108.12.248.100`, Apache + PM2 |
| Database server | Ubuntu 24, `serveradmin@108.12.248.102`, Docker + Postgres |
| Postgres | `postgres.sm73studios.com:5432`, db: `knk`, user: `knkdb` |
| App root | `/srv/www/knk/repo/` (server), `/srv/www/knk/public/` (React dist) |
| PM2 process | `knk-api` on port 3001 |
| Repo | `git@github.com:smartin73/knk.git` |

## Stack
- **Frontend:** React 18 + Vite
- **Backend:** Node.js + Express (ESM modules)
- **Database:** PostgreSQL
- **Process manager:** PM2
- **Web server:** Apache (reverse proxy), SSL via Certbot
- **Sessions:** connect-pg-simple → `user_sessions` table

---

## Deploy Workflow

**Frontend only changed** (no PM2 restart needed):
```bash
cd /srv/www/knk/repo && git pull
cd client && VITE_API_URL=/api npm run build
cp -r dist/* /srv/www/knk/public/
```

**Server files changed** (PM2 restart required):
```bash
cd /srv/www/knk/repo && git pull
pm2 restart knk-api --update-env
```

**Never edit files directly on the server** — always edit on Mac, commit, push, then pull on server.

---

## File Structure

```
server/src/
├── index.js
├── db/pool.js
├── middleware/auth.js
└── routes/
    ├── auth.js
    ├── events.js
    ├── recipes.js
    ├── settings.js
    ├── square.js
    └── modules.js        (ingredients, itemBuilder, eventMenus, donations, vendors)

client/src/
├── App.jsx
├── lib/api.js
├── hooks/useAuth.jsx
└── pages/
    ├── LoginPage.jsx
    ├── DashboardPage.jsx
    ├── EventsPage.jsx
    ├── VendorsPage.jsx
    ├── IngredientsPage.jsx
    ├── RecipesPage.jsx       (includes MakeView component)
    ├── SettingsPage.jsx
    ├── ItemBuilderPage.jsx
    ├── ImportModal.jsx
    ├── RecipesImportModal.jsx
    └── stubs.jsx             (EventMenusPage, DonationsPage)
```

---

## pool.js Exports
```javascript
// IMPORTANT: there is no named 'pool' export
import pool, { query, getClient } from '../db/pool.js';
```

---

## Routes (index.js)
```javascript
app.use('/auth',        authRouter);
app.use('/events',      eventsRouter);
app.use('/recipes',     recipesRouter);
app.use('/ingredients', ingredientsRouter);
app.use('/items',       itemBuilderRouter);
app.use('/event-menus', eventMenusRouter);
app.use('/donations',   donationsRouter);
app.use('/vendors',     vendorsRouter);
app.use('/settings',    settingsRouter);
app.use('/square',      squareRouter);
```

---

## Database Schema

### recipes
```
id               uuid  PK  DEFAULT gen_random_uuid()
recipe_name      text  NOT NULL
recipe_type      text
description      text
serving_size     integer
prep_time        text
cook_time        text
image_url        text
ingredient_label text
contains_label   text
square_id        text
woo_id           text
notes            text
is_active        boolean  DEFAULT true
stage            varchar(20)  DEFAULT 'production'
recipe_by        varchar(255)
fm_uuid          varchar(255)
created_at       timestamptz
updated_at       timestamptz
```

### recipe_steps
```
id                    uuid  PK
recipe_id             uuid  FK → recipes.id
step_number           integer
step_type             text  (regular | fold)
step_description      text
step_time             interval  ← ALWAYS cast ::text in SELECT or React crashes
requires_notification boolean
fold_type             text
fold_interval         text
temp_min              numeric
temp_max              numeric
created_at            timestamptz
updated_at            timestamptz
```

### recipe_ingredients
```
id             uuid  PK
recipe_id      uuid  FK → recipes.id
ingredient_id  uuid  FK → ingredient_items.id
ingredient     text
amount         numeric
measurement    text
sort_order     integer
created_at     timestamptz
updated_at     timestamptz
```

### ingredient_items
```
id             uuid  PK
item_name      text
purchase_from  text
grams          numeric
current_price  numeric
cost_per_gram  numeric  (generated column)
created_at     timestamptz
updated_at     timestamptz
```

### ingredient_price_history
```
id             uuid  PK
ingredient_id  uuid  FK → ingredient_items.id
price          numeric
recorded_at    timestamptz
```

### event_vendors
```
id           uuid  PK
vendor_name  text
address      text
city         text
state        text
zip          text
logo_url     text
map_embed    text
website_url  text
created_at   timestamptz
updated_at   timestamptz
```

### events
```
id            uuid  PK
vendor_id     uuid  FK → event_vendors.id
event_name    text
event_date    date
start_time    time
end_time      time
location      text
description   text
image_url     text
ticket_url    text
map_embed     text
category      text
tags          text
price         numeric
status        text
posted_to_web boolean
created_at    timestamptz
updated_at    timestamptz
```

### item_builder
```
id                  uuid  PK
item_name           text
description         text
batch_qty           numeric
retail_price        numeric
include_packaging   boolean
include_fees        boolean
packaging_cost      numeric
square_fee          numeric
square_fee_online   numeric
food_cook_time      text
ingredient_label    text
contains_label      text
image_url           text
square_id           text
woo_id              text
is_active           boolean
created_at          timestamptz
updated_at          timestamptz
```

### item_builder_items (junction)
```
id               uuid  PK
item_builder_id  uuid  FK → item_builder.id
recipe_id        uuid  FK → recipes.id
ingredient_id    uuid  FK → ingredient_items.id
item_name        text
quantity         numeric
unit             text
sort_order       integer
created_at       timestamptz
updated_at       timestamptz
```

### settings
```
id            uuid  PK
category      text
key           text  UNIQUE
value         text
is_encrypted  boolean
label         text
description   text
created_at    timestamptz
updated_at    timestamptz
```

---

## Critical Gotchas

1. **step_time is a Postgres `interval`** — always cast in SELECT:
   ```sql
   SELECT *, step_time::text as step_time FROM recipe_steps
   ```
   Without this, React crashes with "object with keys {hours}".

2. **recipes.id is a UUID** — `req.params.id` from the URL is already the UUID, use it directly in queries against `recipe_steps.recipe_id`.

3. **Express route order matters** — `/recipes/import` must be defined BEFORE `/:id` or Express matches 'import' as an id param.

4. **PM2 must use --node-args env-file** to load .env:
   ```bash
   pm2 delete knk-api && pm2 start /srv/www/knk/repo/server/src/index.js --name knk-api --node-args="--env-file /srv/www/knk/repo/server/.env" && pm2 save
   ```

5. **Express trust proxy** must be enabled (already set in index.js) for sessions to work behind Apache.

6. **No named `pool` export** from pool.js — use `import pool, { query } from '../db/pool.js'`

---

## Modules Status

| Module | Status |
|--------|--------|
| Events | ✅ Full CRUD + CSV import |
| Vendors | ✅ Full CRUD + CSV import |
| Ingredients | ✅ Full CRUD + price history + CSV import |
| Recipes | ✅ Full CRUD + steps + ingredients + CSV import + stage + MakeView |
| Settings | ✅ All groups (Square, Pushover, WordPress, Costing) |
| ItemBuilder | ✅ Full CRUD + components + costing + Square push |
| Event Menus | 🔲 Stub only |
| Donations | 🔲 Stub only |

---

## Pending Work

- [x] Recipe detail/edit: fetch full recipe (with steps) before opening edit form
- [x] ItemBuilder CSV import
- [x] Actions overflow menu (hamburger) when 3+ actions
- [ ] Event Menus module
- [ ] Donations module
- [x] Square production credentials
- [x] Pushover notifications
- [ ] WordPress integration
- [ ] User management + per-module permissions + password reset
- [ ] Recipe test tracking (version history)
- [ ] Repeating events
- [ ] Square Sales Webhook
- [ ] Sales reporting
- [ ] Mobile nav
