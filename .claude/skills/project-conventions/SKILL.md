---
name: project-conventions
description: KNK code style, patterns, and rules. Apply automatically when writing or reviewing any code in this project.
user-invocable: false
---

## Module system
- ESM only (`"type": "module"` in both package.json files)
- Always `import`/`export`, never `require()`
- `export default` must be at top level of the module — never inside a function or try/catch

## Auth
- Session-based only: `req.session.userId`, `req.session.username`
- Never JWT
- Protected routes use `server/src/middleware/auth.js`
- Client-side: `api.me()` with `{ silent: true }` to check session without redirect

## API client
- All fetch calls go through `client/src/lib/api.js` — never raw `fetch()` in components
- `api.get`, `api.post`, `api.put`, `api.delete` for JSON
- `api.formPost` for multipart forms
- 401 responses automatically redirect to `/login` (except silent calls)

## Styling
- CSS custom properties only: `var(--surface)`, `var(--surface2)`, `var(--text)`, `var(--border)`, `var(--red)`
- No hardcoded colors, no Tailwind, no CSS framework
- Inline styles for component-specific layout; `index.css` for globals and utility classes

## React patterns
- Functional components only
- `useRef` + portal pattern for dropdowns (see RowMenu) — always check both the toggle ref AND the portal container ref in outside-click handlers
- No class components

## Server patterns
- Route files in `server/src/routes/`, each exports `default router`
- Always wrap route handlers in try/catch, return JSON errors: `res.status(N).json({ error: '...' })`
- DB queries via `query()` from `server/src/db/pool.js`

## Database
- PostgreSQL, DB name: `knk`, user: `knkdb`
- `knkdb` lacks CREATE TABLE — migrations must run as postgres superuser
- Migrations are plain `.sql` files in `server/migrations/`

## What NOT to do
- No `console.log` left in production code (use only for intentional server logging)
- No committing `node_modules/`, `client/dist/`, or `.env` files
- No `git add .` or `git add -A` without checking what's staged first
