// Backfill historical Square orders into income_entries + order_line_items
// Usage (run from server/ directory): node scripts/backfill-orders.js path/to/orders.json
//
// The JSON file may be:
//   - An array of order objects:         [ { id, state, ... }, ... ]
//   - A Square API response object:      { orders: [ ... ] }
//   - A single order wrapped in object:  { order: { ... } }

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import pool, { query } from '../src/db/pool.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function cents(n) {
  return n != null ? (Number(n) / 100).toFixed(2) : null;
}

function dateOf(isoString) {
  return isoString ? isoString.slice(0, 10) : null;
}

async function findItemBuilderId(catalogObjectId, lineItemName) {
  // 1. Match via square_variation_id (current) or square_id (legacy)
  if (catalogObjectId) {
    const { rows } = await query(
      `SELECT id FROM item_builder
       WHERE square_variation_id = $1 OR square_id = $1
       LIMIT 1`,
      [catalogObjectId]
    );
    if (rows[0]) return rows[0].id;

    // Also check item_variants
    const { rows: varRows } = await query(
      `SELECT item_builder_id AS id FROM item_variants WHERE square_id = $1 LIMIT 1`,
      [catalogObjectId]
    );
    if (varRows[0]) return varRows[0].id;
  }

  // 2. Fall back to name match
  if (lineItemName) {
    const { rows } = await query(
      `SELECT id FROM item_builder WHERE item_name ILIKE $1 LIMIT 1`,
      [lineItemName]
    );
    if (rows[0]) return rows[0].id;
  }

  return null;
}

async function findEventId(saleDate) {
  if (!saleDate) return null;
  const { rows } = await query(
    `SELECT id FROM events WHERE event_date = $1`,
    [saleDate]
  );
  // Null if zero or multiple matches
  return rows.length === 1 ? rows[0].id : null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/backfill-orders.js path/to/orders.json');
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
  } catch (e) {
    console.error('Failed to read/parse JSON file:', e.message);
    process.exit(1);
  }

  // Normalise to array of order objects
  let orders;
  if (Array.isArray(raw)) {
    orders = raw;
  } else if (Array.isArray(raw.orders)) {
    orders = raw.orders;
  } else if (raw.order) {
    orders = [raw.order];
  } else {
    console.error('Unrecognised JSON shape — expected array, { orders: [] }, or { order: {} }');
    process.exit(1);
  }

  console.log(`\nLoaded ${orders.length} order(s) from ${filePath}\n`);

  let ordersProcessed = 0;
  let ordersSkipped   = 0;
  let incomeInserted  = 0;
  let lineItemsInserted  = 0;
  let lineItemsDuplicate = 0;
  let unmatchedItems  = 0;

  for (const order of orders) {
    const orderId  = order.id;
    const state    = order.state;
    const saleDate = dateOf(order.created_at);
    const amount   = cents(order.total_money?.amount);

    if (state !== 'COMPLETED') {
      ordersSkipped++;
      continue;
    }

    // ── income_entries (idempotent) ─────────────────────────────────────────
    const { rowCount: alreadyExists } = await query(
      'SELECT 1 FROM income_entries WHERE reference_id = $1',
      [orderId]
    );

    if (alreadyExists === 0) {
      const eventId = await findEventId(saleDate);
      await query(
        `INSERT INTO income_entries (source, amount, date, event_id, description, reference_id)
         VALUES ('square', $1, $2, $3, 'Square Sale', $4)`,
        [amount, saleDate, eventId, orderId]
      );
      incomeInserted++;
    }

    // ── order_line_items ────────────────────────────────────────────────────
    const lineItems = order.line_items || [];
    const eventId   = await findEventId(saleDate);

    for (const li of lineItems) {
      const catalogId   = li.catalog_object_id || null;
      const name        = li.name || null;
      const qty         = li.quantity != null ? Number(li.quantity) : null;
      const unitPrice   = cents(li.base_price_money?.amount);
      const total       = cents(li.total_money?.amount);

      const itemBuilderId = await findItemBuilderId(catalogId, name);
      if (!itemBuilderId) unmatchedItems++;

      const { rowCount } = await query(
        `INSERT INTO order_line_items
           (square_order_id, item_builder_id, item_name, quantity, unit_price, total, sale_date, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (square_order_id, item_name) DO NOTHING`,
        [orderId, itemBuilderId, name, qty, unitPrice, total, saleDate, eventId]
      );

      if (rowCount > 0) {
        lineItemsInserted++;
      } else {
        lineItemsDuplicate++;
      }
    }

    ordersProcessed++;

    if (ordersProcessed % 50 === 0) {
      console.log(`  … ${ordersProcessed} orders processed so far`);
    }
  }

  console.log('\n── Results ─────────────────────────────────────');
  console.log(`Orders processed:       ${ordersProcessed}`);
  console.log(`Orders skipped:         ${ordersSkipped} (non-COMPLETED)`);
  console.log(`income_entries inserted: ${incomeInserted}`);
  console.log(`Line items inserted:    ${lineItemsInserted}`);
  console.log(`Line items duplicate:   ${lineItemsDuplicate} (skipped)`);
  console.log(`Unmatched items:        ${unmatchedItems} (no item_builder match)`);
  console.log('────────────────────────────────────────────────\n');

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
