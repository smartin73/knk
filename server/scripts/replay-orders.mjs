// One-off script to replay missed Square orders and decrement qty_on_hand
// Usage: node scripts/replay-orders.mjs
import pg from 'pg';
import 'dotenv/config';

const ORDER_IDS = [
  'yhPElSLq6FYnR4sVa0m63thn0D7YY',
  'UsIAefnPYSaWZ5vm3M3Q0zryLrAZY',
  '4qQ9ApA1xDV3gEwhnhb6GoVl9nZZY',
  'g8zZzYDz1ePoynAdRJvfxGCRlOKZY',
  '2xCeRJOHadz8XSEecbOubxH8arNZY',
  'YiGGIRSYI6qWNPx8IRVfwNSj24JZY',
  '8gyL1H7Jpz2nVPDmVKX4VyDS8JbZY',
  'mBkrmttVnzv8xjoK3UfWuKnObGNZY',
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function getSettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN (
      'square_environment', 'square_production_token', 'square_sandbox_token'
    )`
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

async function main() {
  const settings = await getSettings();
  const env = settings.square_environment || 'production';
  const token = env === 'production' ? settings.square_production_token : settings.square_sandbox_token;
  const base = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

  console.log(`Using Square environment: ${env}\n`);

  for (const orderId of ORDER_IDS) {
    try {
      const res = await fetch(`${base}/v2/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-01-18' },
      });

      if (!res.ok) {
        console.error(`❌ ${orderId} — fetch failed: ${await res.text()}`);
        continue;
      }

      const data = await res.json();
      const lineItems = data.order?.line_items || [];

      if (lineItems.length === 0) {
        console.log(`⚠️  ${orderId} — no line items`);
        continue;
      }

      for (const item of lineItems) {
        const variationId = item.catalog_object_id;
        if (!variationId) continue;
        const qty = parseInt(item.quantity || '1', 10);

        const { rowCount } = await query(
          `UPDATE event_menu_items
           SET qty_on_hand = GREATEST(0, qty_on_hand - $1)
           WHERE item_builder_id IN (
             SELECT id FROM item_builder WHERE square_variation_id = $2
             UNION
             SELECT item_builder_id FROM item_variants WHERE square_id = $2
           )
           AND menu_id IN (SELECT id FROM event_menus WHERE is_active = true)`,
          [qty, variationId]
        );
        console.log(`✓  ${orderId} — variationId ${variationId} qty ${qty} → ${rowCount} row(s) updated`);
      }
    } catch (e) {
      console.error(`❌ ${orderId} — error: ${e.message}`);
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main();
