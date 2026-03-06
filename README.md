# Knife & Knead — Web App

## Stack
- **Frontend** React + Vite (served via nginx)
- **API** Node.js + Express
- **Database** PostgreSQL 16
- **Sessions** Redis 7
- **Reverse proxy** Nginx (SSL termination)

## First-time Setup

> **Traefik note:** This stack sits behind your existing Traefik instance. Both `api` and `client` containers join the external `traefik` network — no ports are exposed directly.


### 1. Configure environment
```bash
cp .env.example .env
# Edit .env — set all passwords and your FQDN
```


### 3. Start the stack
```bash
docker compose up -d
```

### 4. Create admin user (first time only)
```bash
docker compose exec api node seed.js
```
Login at `https://yourdomain.com` with username `admin` and the password from your `.env`.

---

## Development (local, no Docker)

**API:**
```bash
cd server
npm install
DATABASE_URL=postgresql://... REDIS_URL=redis://... SESSION_SECRET=dev ADMIN_PASSWORD=dev node src/index.js
```

**Client:**
```bash
cd client
npm install
npm run dev   # proxies /api → localhost:3001
```

---

## Module Build Order
1. ✅ Events (WordPress plugin — separate)
2. 🔲 Recipes + Item Builder
3. 🔲 Ingredients & Inventory
4. 🔲 Event Menus
5. 🔲 Sales (Square + WooCommerce)
6. 🔲 Finance / Invoices
7. 🔲 Donations

---

## API Endpoints (internal, auth required)

| Resource | Base path |
|---|---|
| Auth | `/auth/login` `/auth/logout` `/auth/me` |
| Events | `/events` |
| Recipes | `/recipes` |
| Ingredients | `/ingredients` |
| Item Builder | `/items` |
| Event Menus | `/event-menus` |
| Donations | `/donations` |
| File upload | `/upload` |

All write endpoints require an active session cookie (set on login).

---

## WordPress Integration
The Simple Events WordPress plugin can read/write events via the same API.
Point it at `https://yourdomain.com/api/events` with an API key header.
(API key auth to be added to the Express API in a future iteration.)
