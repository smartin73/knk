---
name: deploy
description: Generate the exact commands to deploy KNK to production. Use when the user wants to deploy or push to the server.
disable-model-invocation: true
---

## Current repo state
- Branch: !`git branch --show-current`
- Unpushed commits: !`git log origin/main..HEAD --oneline 2>/dev/null || echo "(none)"`
- Changed files vs main: !`git diff --name-only origin/main 2>/dev/null || echo "(unknown)"`

---

Generate a deploy checklist for the user to run on the server (knk1@108.12.248.100). They must SSH in and paste the commands manually — there is no automated SSH access from dev.

**Step 1: On dev machine — push if needed**
If there are unpushed commits, show:
```
git push
```

**Step 2: On the server — always**

Look at the changed files list and determine which of these steps are needed:

- If ANY `server/` files changed (routes, package.json, etc.):
  ```bash
  cd /srv/www/knk/repo && git pull
  cd server && npm install && cd ..
  pm2 restart knk-api --update-env
  ```

- If ANY `client/` files changed:
  ```bash
  cd /srv/www/knk/repo && git pull
  cd client && npm install && npm run build && cd ..
  cp -r /srv/www/knk/repo/client/dist/. /srv/www/knk/public/
  ```

- If only server files changed (no client):
  ```bash
  cd /srv/www/knk/repo && git pull
  cd server && npm install && cd ..
  pm2 restart knk-api --update-env
  ```

- If both changed, combine into one sequence (git pull only once).

**Step 3: Verify**
Always end with:
```bash
pm2 logs knk-api --lines 20
```
Tell the user to check for errors in the output.

**DB migrations**: If any `.sql` files in `server/migrations/` were changed, remind the user to run:
```bash
sudo -u postgres psql -d knk -f /srv/www/knk/repo/server/migrations/<filename>.sql
```

Output the final commands as clean copy-pasteable bash blocks with brief section headers. Keep it concise.
