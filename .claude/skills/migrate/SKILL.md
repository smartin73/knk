---
name: migrate
description: Create a new database migration SQL file for KNK. Use when the user wants to add/alter tables or columns.
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Bash
---

## Existing migrations
!`ls server/migrations/ 2>/dev/null || echo "(none yet)"`

## Existing schema (for reference)
!`cat server/db/init.sql 2>/dev/null || echo "(not found)"`

---

Create a database migration for: $ARGUMENTS

1. Generate a filename with a timestamp prefix: `YYYYMMDD_<short_description>.sql`
   - Use today's date (2026-03-13 format, replace dashes)
   - Keep the description short and snake_case

2. Write the file to `server/migrations/<filename>.sql` with:
   - A comment at the top describing what the migration does
   - The SQL statements
   - No destructive operations without explicit user request (no DROP TABLE, no DROP COLUMN)
   - Use `IF NOT EXISTS` for CREATE TABLE
   - Use `IF NOT EXISTS` for ADD COLUMN (via `DO $$ BEGIN ... EXCEPTION WHEN duplicate_column ... END $$`)

3. After creating the file, output:
   - The filename created
   - The exact command to run on the server:
     ```bash
     sudo -u postgres psql -d knk -f /srv/www/knk/repo/server/migrations/<filename>.sql
     ```
   - A reminder: "Pull the latest code on the server first (`git pull`) before running the migration."
