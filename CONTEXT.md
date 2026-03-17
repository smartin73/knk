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
    ├── finance.js        (income_entries, expense_entries + donations export)
    ├── wordpress.js      (push events → WP plugin, push items → WooCommerce REST API)
    ├── notifications.js
    ├── users.js
    ├── webhooks.js
    └── modules.js        (ingredients, itemBuilder, eventMenus, donations, vendors)

client/src/
├── App.jsx               (includes mobile nav drawer + hamburger)
├── lib/api.js
├── hooks/useAuth.jsx
└── pages/
    ├── LoginPage.jsx
    ├── DashboardPage.jsx
    ├── EventsPage.jsx        (includes LogSalesModal → POST /finance/income; RepeatModal → POST /events/repeat)
    ├── VendorsPage.jsx
    ├── IngredientsPage.jsx
    ├── RecipesPage.jsx       (includes MakeView component)
    ├── SettingsPage.jsx
    ├── ItemBuilderPage.jsx   (includes variants tab + Push to Square + Push to WooCommerce)
    ├── ItemBuilderImportModal.jsx
    ├── RecipesImportModal.jsx
    ├── DonationsPage.jsx
    ├── FinancePage.jsx
    ├── UsersPage.jsx
    ├── TestLogPage.jsx
    ├── EventMenusPage.jsx
    ├── MenuDisplayPage.jsx
    ├── MenuLandingPage.jsx   (handles both /menu and /menu/specials; specials prop → redirects to /menu/:id/specials)
    └── MenuSpecialsPage.jsx  (specials-only display for second tablet TWA)
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
app.use('/settings',      settingsRouter);
app.use('/users',         usersRouter);
app.use('/finance',       financeRouter);
app.use('/square',        squareRouter);
app.use('/webhooks',      webhooksRouter);
app.use('/notifications', notificationsRouter);
app.use('/wordpress',     wordpressRouter);
// Public (no auth): GET /public/branding, GET /public/menus, GET /public/menu/:id
// React routes: /menu → MenuLandingPage, /menu/specials → MenuLandingPage (specials mode) → /menu/:id/specials
//               /menu/:id → MenuDisplayPage, /menu/:id/specials → MenuSpecialsPage
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
is_active      boolean  DEFAULT true
created_at     timestamptz
updated_at     timestamptz
```
Migration: `server/migrations/add_ingredient_soft_delete.sql`

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
map_embed     text       ← iframe embed; "Generate from Location" button auto-builds from location field
category      text
tags          text
price         numeric
status        text
posted_to_web boolean
woo_id        text       ← WordPress Simple Events plugin ID; null = not yet pushed
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
is_favorite         boolean  DEFAULT false
freezer_qty         integer  DEFAULT 0   ← current unbaked stock in freezer
created_at          timestamptz
updated_at          timestamptz
```
Migrations: `server/migrations/add_item_builder_favorites.sql`, `server/migrations/add_freezer_qty.sql`

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

### item_variants
```
id               uuid  PK  DEFAULT gen_random_uuid()
item_builder_id  uuid  NOT NULL  FK → item_builder.id  ON DELETE CASCADE
variant_name     text  NOT NULL
price_override   numeric           (null = use item retail_price)
square_id        text
sort_order       integer  DEFAULT 0
is_active        boolean  DEFAULT true
created_at       timestamptz
updated_at       timestamptz
```
Migration: `server/migrations/add_item_variants.sql`

### event_menus
```
id          uuid  PK  DEFAULT gen_random_uuid()
event_id    uuid  FK → events.id  ON DELETE CASCADE
menu_name   text  NOT NULL
created_at  timestamptz
updated_at  timestamptz
```

### event_menu_items
```
id               uuid  PK  DEFAULT gen_random_uuid()
menu_id          uuid  FK → event_menus.id  ON DELETE CASCADE
item_builder_id  uuid  FK → item_builder.id
qty_on_hand      integer  DEFAULT 0
limited_threshold integer  DEFAULT 0
sort_order       integer  DEFAULT 0
is_special       boolean  DEFAULT false   ← migration: add_menu_specials.sql
created_at       timestamptz
updated_at       timestamptz
```
Migration: `server/migrations/add_menu_specials.sql`

### donations
```
id               uuid  PK
event_id         uuid  FK → events.id
item_builder_id  uuid  FK → item_builder.id
quantity         numeric  NOT NULL  DEFAULT 1
unit_value       numeric  NOT NULL  DEFAULT 0
donated_at       date
notes            text
created_at       timestamptz
updated_at       timestamptz
```
Migration: `server/migrations/rebuild_donations.sql`

### income_entries
```
id           uuid  PK  DEFAULT gen_random_uuid()
source       text  CHECK IN ('square','website','manual')
amount       numeric
date         date
event_id     uuid  FK → events.id
description  text
notes        text
created_at   timestamptz
updated_at   timestamptz
```

### expense_entries
```
id           uuid  PK  DEFAULT gen_random_uuid()
category     text
amount       numeric
date         date
description  text
notes        text
created_at   timestamptz
updated_at   timestamptz
```
Migration: `server/migrations/add_finance_tables.sql`

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
Configured keys: `square_*`, `pushover_*`, `gemini_api_key`, `wordpress_site_url`, `wordpress_api_key`,
`woo_consumer_key`, `woo_consumer_secret`, `cloudinary_*`, `logo_url`, `menu_logo_url`, `sold_out_image_url`,
`menu_refresh_interval`, `packaging_cost`, `square_fee_*`

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

7. **Soft deletes on Item Builder, Recipes, Ingredients** — `DELETE` routes set `is_active=false` instead of hard-deleting to avoid FK constraint errors from historical records (donations, recipe components, etc.). List queries filter `WHERE is_active=true`. Hard-delete is only safe if no dependent records exist.
   - Events: hard delete is blocked with a clear error if donations or income entries exist — use Cancelled status instead.

8. **DB migrations must run from the DB server** — `knkdb` lacks ALTER TABLE. Postgres is on a separate server (108.12.248.102). Pipe migrations via SSH:
   ```bash
   cat /srv/www/knk/repo/server/migrations/<file>.sql | ssh serveradmin@108.12.248.102 "sudo -u postgres psql -d knk"
   ```

---

## Modules Status

| Module | Status |
|--------|--------|
| Events | ✅ Full CRUD + CSV import + Repeat + Push to Web / Sync to Web / Unlink from Web (WordPress Simple Events plugin); "Generate from Location" button auto-fills map embed |
| Vendors | ✅ Full CRUD + CSV import |
| Ingredients | ✅ Full CRUD + price history + CSV import |
| Recipes | ✅ Full CRUD + steps + ingredients + CSV import + stage + MakeView + test logging |
| Settings | ✅ Square, Pushover, WordPress + WooCommerce, Costing, Cloudinary, Branding (admin logo, menu display logo, sold-out image), Event Menus |
| ItemBuilder | ✅ Full CRUD + components + costing + variants + Push to Square + Push to WooCommerce + Favorites (star toggle, filter, sort to top, integrated in Menu Builder picker) + Freezer stock (inline +/– in list; "Add to Freezer" from MakeView) + image display in detail modal |
| Branding | ✅ Admin logo (login + sidebar), Menu Display logo (public menu header), Sold-Out image (full-screen when all items sold out on a menu); all via Cloudinary image upload in Settings → Branding |
| Event Menus | ✅ Full CRUD admin + public display (/menu/:id) + landing page (/menu) + Square webhook (Phase 2) + Menu Specials (is_special flag, star toggle in admin, MenuSpecialsPage at /menu/:id/specials, auto-redirect at /menu/specials) |
| Donations | ✅ Full CRUD + CSV export (item-based, linked to events + item builder) |
| Users | ✅ Admin/member roles + user management + change password |
| Income/Expenses | ✅ Income + Expenses CRUD + CSV export (donations auto-included) + Log Sales action on Events |
| WordPress/WooCommerce | ✅ Push events → WP plugin (RowMenu: "Push to Web" / "Sync to Web" / "Unlink from Web"); Push items → WooCommerce REST API; simple + variable products with variants |
| Mobile Nav | ✅ Hamburger + slide-out drawer, auto-closes on route change |

---

## Pending Work

- [x] Recipe detail/edit: fetch full recipe (with steps) before opening edit form
- [x] ItemBuilder CSV import
- [x] Actions overflow menu (hamburger) when 3+ actions
- [x] Event Menus module (Phase 1 + Phase 2 webhook)
- [x] Square production credentials
- [x] Pushover notifications
- [x] Recipe test logging
- [x] Cloudinary image upload
- [x] Users module (roles: admin/member) — security foundation for multi-user access
- [x] Donations module (needs schema rebuild) — prerequisite for Income/Expenses
- [x] Income vs Expenses module — needs Donations done first
- [x] Mobile nav / full mobile pass
- [x] Item variations — per-item variants with name, price override, Square ID
- [x] WordPress integration — Push to WooCommerce on ItemBuilder (simple + variable products with variants); Push events to WP plugin already existed
- [x] Repeating events — Repeat… RowMenu action; frequency (weekly/biweekly/monthly) + end date; live date preview; generates independent Draft events via POST /events/repeat
- [ ] Event Menus Phase 2 live testing — waiting on next event
- [x] Recipe version history (covered by Test module)
- [x] Notifications on Recipe Steps — MakeView: steps with requires_notification=true show ⏱ Start button; countdown timer runs for step_time duration; fires POST /notifications/send (Pushover) when timer expires; shows ✓ Notified
- [x] Menu Specials — is_special flag on event_menu_items; star toggle in admin; MenuSpecialsPage (/menu/:id/specials); /menu/specials auto-redirect; migration: add_menu_specials.sql (run as postgres superuser on DB server)
- [x] Android TWA — bubblewrap APK; specials APK active (start_url=/menu/specials); Apache fix: `Alias /icons/ "/srv/www/knk/public/icons/"` in knk-le-ssl.conf overrides mod_alias default; icons in client/public/icons/; manifest.json in client/public/; known issue: both APKs can't coexist (same packageId) — fix by changing packageId + name in twa-manifest.json before building second APK
- [x] Branding — admin logo (login + sidebar) via logo_url; menu display logo via menu_logo_url; sold-out full-screen image via sold_out_image_url; public endpoint GET /public/branding (no auth)
- [ ] Event auto-push to WordPress — auto-push on create/save instead of manual button; "Posted to website" indicator driven by woo_id presence
- [x] Item Builder Favorites — is_favorite boolean on item_builder; star toggle, filter button, sort to top in list; favorites sorted to top + star indicator in Menu Builder item picker
- [x] Inventory Phase 1: Freezer Stock — freezer_qty on item_builder; inline +/– on ItemBuilder list; "Add to Freezer" button in MakeView pre-fills scaledYield, picks item from item_builder, calls PATCH /items/:id/freezer; migration: add_freezer_qty.sql
- [ ] Inventory Phase 2: Baking Plan + Shopping List — date-range → events → aggregate menu items → deficit vs freezer → batches → ingredient grams → purchase units (needs unit_label/unit_grams on ingredient_items)
- [ ] Kitchen Display System (KDS) — `kds_item` flag on item_builder; Square webhooks → SSE → full-screen `/kds` page; order cards with KDS line items + "Done" dismiss; display via Fully Kiosk Browser on Android tablet (no TWA needed)
- [ ] Monthly Tax Filing (RI) — two AcroForm PDFs auto-filled monthly via pdf-lib + nodemailer + node-cron; STR (str.pdf, 54 fields) + MTM (mtm.pdf, 9 fields) stored in server/tax-forms/; data source TBD (Square API vs income_entries); settings needed: SMTP, EIN, RI account #, business info
- [ ] Event Menus mobile editing — admin add/edit menu item flows not usable on small screens
- [ ] Ingredients duplicate detection — fuzzy name match to surface potential dupes (e.g. "Confectioners Sugar" vs "Confectioners Sugar (for decorating)"); user reviews + manually merges (re-points recipe_ingredients rows, soft-deletes duplicate)
- [ ] Settings screen cleanup — too many sections; reorganize/collapse to reduce visual bloat
