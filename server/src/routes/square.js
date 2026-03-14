import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function getSquareSettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN (
      'square_environment',
      'square_sandbox_token', 'square_sandbox_location_id',
      'square_production_token', 'square_production_location_id'
    )`
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  const env = map.square_environment || 'sandbox';
  return {
    square_environment:  env,
    square_access_token: env === 'production' ? map.square_production_token       : map.square_sandbox_token,
    square_location_id:  env === 'production' ? map.square_production_location_id : map.square_sandbox_location_id,
  };
}

function squareBaseUrl(env) {
  return env === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

async function squareFetch(path, method, body, settings) {
  const base = squareBaseUrl(settings.square_environment);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${settings.square_access_token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errors?.[0]?.detail || 'Square API error');
  return data;
}

// POST /square/push/:itemId  — push a single item to Square catalog
router.post('/push/:itemId', async (req, res) => {
  try {
    const settings = await getSquareSettings();
    if (!settings.square_access_token) {
      return res.status(400).json({ error: 'Square access token not configured in Settings.' });
    }
    if (!settings.square_location_id) {
      return res.status(400).json({ error: 'Square location ID not configured in Settings.' });
    }

    // Fetch the item
    const { rows } = await query('SELECT * FROM item_builder WHERE id=$1', [req.params.itemId]);
    if (!rows[0]) return res.status(404).json({ error: 'Item not found' });
    const item = rows[0];

    const idempotencyKey = `knk-${item.id}-${Date.now()}`;
    const priceMoney = item.retail_price
      ? { amount: Math.round(parseFloat(item.retail_price) * 100), currency: 'USD' }
      : null;

    if (item.square_id) {
      // ── UPDATE existing Square item ──
      // First retrieve current version
      const existing = await squareFetch(`/v2/catalog/object/${item.square_id}`, 'GET', null, settings);
      const currentVersion = existing.object?.version;

      const payload = {
        idempotency_key: idempotencyKey,
        object: {
          type: 'ITEM',
          id: item.square_id,
          version: currentVersion,
          item_data: {
            name: item.item_name,
            description: item.description || '',
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: existing.object?.item_data?.variations?.[0]?.id || `#var-${item.id}`,
                version: existing.object?.item_data?.variations?.[0]?.version,
                item_variation_data: {
                  item_id: item.square_id,
                  name: 'Regular',
                  pricing_type: priceMoney ? 'FIXED_PRICING' : 'VARIABLE_PRICING',
                  price_money: priceMoney || undefined,
                  location_overrides: [
                    { location_id: settings.square_location_id, track_inventory: false },
                  ],
                },
              },
            ],
          },
        },
      };

      const result = await squareFetch('/v2/catalog/object', 'PUT', payload, settings);
      const squareId = result.catalog_object?.id;
      const variationId = result.catalog_object?.item_data?.variations?.[0]?.id;

      await query('UPDATE item_builder SET square_id=$1, square_variation_id=$2, updated_at=now() WHERE id=$3', [squareId, variationId, item.id]);
      return res.json({ ok: true, action: 'updated', square_id: squareId });

    } else {
      // ── CREATE new Square item ──
      const payload = {
        idempotency_key: idempotencyKey,
        object: {
          type: 'ITEM',
          id: `#item-${item.id}`,
          item_data: {
            name: item.item_name,
            description: item.description || '',
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: `#var-${item.id}`,
                item_variation_data: {
                  name: 'Regular',
                  pricing_type: priceMoney ? 'FIXED_PRICING' : 'VARIABLE_PRICING',
                  price_money: priceMoney || undefined,
                  location_overrides: [
                    { location_id: settings.square_location_id, track_inventory: false },
                  ],
                },
              },
            ],
          },
        },
      };

      const result = await squareFetch('/v2/catalog/object', 'POST', payload, settings);
      const squareId = result.catalog_object?.id;
      const variationId = result.catalog_object?.item_data?.variations?.[0]?.id;

      await query('UPDATE item_builder SET square_id=$1, square_variation_id=$2, updated_at=now() WHERE id=$3', [squareId, variationId, item.id]);
      return res.json({ ok: true, action: 'created', square_id: squareId });
    }

  } catch (e) {
    console.error('Square push error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /square/unlink/:itemId  — remove Square ID from item (does not delete from Square)
router.delete('/unlink/:itemId', async (req, res) => {
  await query('UPDATE item_builder SET square_id=NULL WHERE id=$1', [req.params.itemId]);
  res.json({ ok: true });
});

export default router;