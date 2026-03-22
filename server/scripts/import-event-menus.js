// Import historical event menus and menu items from FileMaker CSV exports.
// Usage (run from server/ directory):
//   node scripts/import-event-menus.js fm_menus.csv fm_menu_items.csv
//   node scripts/import-event-menus.js fm_menus.csv fm_menu_items.csv --dry-run
//
// Requires migration add_event_menu_item_variant_qty_sold.sql to be run first.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Args ──────────────────────────────────────────────────────────────────────

const rawArgs   = process.argv.slice(2);
const dryRun    = rawArgs.includes('--dry-run');
const fileArgs  = rawArgs.filter(a => a !== '--dry-run');

if (fileArgs.length < 2) {
  console.error('Usage: node scripts/import-event-menus.js fm_menus.csv fm_menu_items.csv [--dry-run]');
  process.exit(1);
}

const [menusFile, itemsFile] = fileArgs;

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(filePath) {
  const raw     = readFileSync(resolve(filePath), 'utf8');
  const lines   = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
  const rows    = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function num(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

// ── Lookup caches ─────────────────────────────────────────────────────────────

// fm_uuid (lowercased) → { id, event_name }
const eventByFmUuid = new Map();

// event_id → menu_id  (populated during step 1, also pre-loaded for existing menus)
const menuByEventId = new Map();

async function loadCaches() {
  const { rows: events } = await query(
    `SELECT id, event_name, fm_uuid FROM events WHERE fm_uuid IS NOT NULL`
  );
  for (const e of events) eventByFmUuid.set(e.fm_uuid.toLowerCase(), e);

  const { rows: menus } = await query(
    `SELECT id, event_id FROM event_menus`
  );
  for (const m of menus) menuByEventId.set(m.event_id, m.id);
}

// square_id → { item_builder_id, variant_id }
// Tries item_variants first, falls back to item_builder
async function findItemBySquareId(squareId) {
  if (!squareId) return null;

  const { rows: varRows } = await query(
    `SELECT id AS variant_id, item_builder_id FROM item_variants WHERE square_id = $1 LIMIT 1`,
    [squareId]
  );
  if (varRows[0]) return { item_builder_id: varRows[0].item_builder_id, variant_id: varRows[0].variant_id };

  const { rows: ibRows } = await query(
    `SELECT id AS item_builder_id FROM item_builder WHERE square_id = $1 OR square_variation_id = $1 LIMIT 1`,
    [squareId]
  );
  if (ibRows[0]) return { item_builder_id: ibRows[0].item_builder_id, variant_id: null };

  return null;
}

// ── Step 1 — Import event_menus ───────────────────────────────────────────────

async function importMenus(rows) {
  let processed = 0, inserted = 0, skippedExists = 0;
  const unmatchedEvents = [];

  for (const row of rows) {
    const fmUuid = (row.em_fk_eventId || '').toLowerCase();
    if (!fmUuid) continue;
    processed++;

    const event = eventByFmUuid.get(fmUuid);
    if (!event) {
      unmatchedEvents.push({ fmUuid, date: row.em_EventDate });
      continue;
    }

    // Skip if a menu already exists for this event
    if (menuByEventId.has(event.id)) {
      skippedExists++;
      continue;
    }

    if (dryRun) {
      console.log(`  [menu] would insert: "${event.event_name}"`);
      // Use a placeholder so step 2 can reference it in dry run
      menuByEventId.set(event.id, `dry-run-${event.id}`);
    } else {
      const { rows: inserted_rows } = await query(
        `INSERT INTO event_menus (event_id, menu_name, is_active)
         VALUES ($1, $2, false)
         RETURNING id`,
        [event.id, event.event_name]
      );
      menuByEventId.set(event.id, inserted_rows[0].id);
      console.log(`  ✓ menu: "${event.event_name}"`);
    }
    inserted++;
  }

  return { processed, inserted, skippedExists, unmatchedEvents };
}

// ── Step 2 — Import event_menu_items ─────────────────────────────────────────

async function importMenuItems(rows) {
  let processed = 0, inserted = 0, skipped = 0;
  const unmatchedSquareIds = new Map(); // squareId → count

  for (const row of rows) {
    const fmUuid  = (row.em_fk_eventId || '').toLowerCase();
    const sqId    = row.emi_fk_squareId || '';
    if (!fmUuid || !sqId) { skipped++; continue; }
    processed++;

    const event = eventByFmUuid.get(fmUuid);
    if (!event) { skipped++; continue; } // already logged in step 1

    const menuId = menuByEventId.get(event.id);
    if (!menuId) { skipped++; continue; } // no menu for this event

    const item = await findItemBySquareId(sqId);
    if (!item) {
      unmatchedSquareIds.set(sqId, (unmatchedSquareIds.get(sqId) || 0) + 1);
      continue;
    }

    const qtyMade   = num(row.emi_QtyMade, 0);
    const qtySold   = num(row.emi_QtySold_Calc, 0);
    const qtyOnHand = Math.max(0, qtyMade - qtySold);
    const isSpecial = (row.emi_Special || '').trim() !== '';
    const limited   = row.limited_threshold?.trim() ? num(row.limited_threshold, 0) : null;

    if (dryRun) {
      console.log(`  [item] would insert: "${event.event_name}" — sqId ${sqId}  made:${qtyMade} sold:${qtySold} onhand:${qtyOnHand}${isSpecial ? ' [special]' : ''}`);
    } else {
      // Skip if already exists (idempotent on re-run)
      const { rowCount: exists } = await query(
        `SELECT 1 FROM event_menu_items WHERE menu_id = $1 AND item_builder_id = $2`,
        [menuId, item.item_builder_id]
      );
      if (exists > 0) { skipped++; continue; }

      await query(
        `INSERT INTO event_menu_items
           (menu_id, item_builder_id, variant_id, qty_initial, qty_on_hand, qty_sold,
            is_special, limited_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [menuId, item.item_builder_id, item.variant_id,
         qtyMade, qtyOnHand, qtySold, isSpecial, limited]
      );
    }
    inserted++;
  }

  return { processed, inserted, skipped, unmatchedSquareIds };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (dryRun) console.log('── DRY RUN — no changes will be written ──\n');

  let menuRows, itemRows;
  try {
    menuRows = parseCSV(menusFile);
    itemRows = parseCSV(itemsFile);
  } catch (e) {
    console.error('Failed to read CSV files:', e.message);
    process.exit(1);
  }

  console.log(`Loaded ${menuRows.length} menu row(s) from ${menusFile}`);
  console.log(`Loaded ${itemRows.length} item row(s) from ${itemsFile}\n`);

  await loadCaches();

  console.log('── Step 1: Event Menus ──────────────────────────────────────────');
  const menuStats = await importMenus(menuRows);

  console.log('\n── Step 2: Event Menu Items ─────────────────────────────────────');
  const itemStats = await importMenuItems(itemRows);

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log('\n── Results ──────────────────────────────────────────────────────');
  console.log('Menus:');
  console.log(`  Processed:              ${menuStats.processed}`);
  console.log(`  Inserted:               ${menuStats.inserted}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  Skipped (already exist): ${menuStats.skippedExists}`);
  console.log(`  Unmatched events:       ${menuStats.unmatchedEvents.length}`);
  console.log('Menu Items:');
  console.log(`  Processed:              ${itemStats.processed}`);
  console.log(`  Inserted:               ${itemStats.inserted}${dryRun ? ' (dry run)' : ''}`);
  console.log(`  Skipped:                ${itemStats.skipped}`);
  console.log(`  Unmatched Square IDs:   ${itemStats.unmatchedSquareIds.size}`);

  if (menuStats.unmatchedEvents.length > 0) {
    console.log('\n── Unmatched events (no knk event with this fm_uuid) ────────────');
    for (const u of menuStats.unmatchedEvents) {
      console.log(`  ${u.date}  fm_uuid: ${u.fmUuid}`);
    }
  }

  if (itemStats.unmatchedSquareIds.size > 0) {
    console.log('\n── Unmatched Square IDs (no item_builder or variant match) ──────');
    for (const [sqId, count] of itemStats.unmatchedSquareIds) {
      console.log(`  ${sqId}  (${count} row${count !== 1 ? 's' : ''})`);
    }
  }

  console.log('─────────────────────────────────────────────────────────────────\n');

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
