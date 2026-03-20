import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function getSquareSettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN (
      'square_webhook_key', 'square_environment',
      'square_production_token', 'square_sandbox_token'
    )`
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return map;
}

function verifySignature(rawBody, signatureHeader, webhookKey, notificationUrl) {
  const payload = notificationUrl + rawBody.toString();
  const expected = createHmac('sha256', webhookKey).update(payload).digest('base64');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

async function processOrderId(orderId, settings) {
  const env = settings.square_environment || 'sandbox';
  const token = env === 'production' ? settings.square_production_token : settings.square_sandbox_token;
  const base = env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';

  const orderRes = await fetch(`${base}/v2/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2024-01-18',
    },
  });

  if (!orderRes.ok) {
    const text = await orderRes.text();
    throw new Error(`Square order fetch failed: ${text}`);
  }

  const orderData = await orderRes.json();
  const lineItems = orderData.order?.line_items || [];

  const results = [];
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
       AND menu_id IN (
         SELECT id FROM event_menus WHERE is_active = true
       )`,
      [qty, variationId]
    );
    results.push({ variationId, qty, rowsUpdated: rowCount });
  }

  return { orderId, lineItems: results };
}

// POST /webhooks/square — receives Square sale events, decrements qty_on_hand
router.post('/square', async (req, res) => {
  try {
    console.log('[webhook] received type:', req.body.type);
    const settings = await getSquareSettings();
    const webhookKey = settings.square_webhook_key;

    if (webhookKey) {
      const signature = req.headers['x-square-hmacsha256-signature'];
      const notificationUrl = `${req.protocol}://${req.get('host')}/api/webhooks/square`;
      console.log('[webhook] verifying sig, url:', notificationUrl, 'sig present:', !!signature);
      if (!signature || !verifySignature(req.rawBody, signature, webhookKey, notificationUrl)) {
        console.error('[webhook] signature mismatch. URL used:', notificationUrl);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const eventType = req.body.type;
    const payment = req.body.data?.object?.payment;

    if (eventType !== 'payment.updated' || payment?.status !== 'COMPLETED') {
      return res.json({ ok: true, skipped: true });
    }

    const orderId = payment?.order_id;
    if (!orderId) return res.json({ ok: true, skipped: true });

    const result = await processOrderId(orderId, settings);
    console.log('[webhook] processed:', result);
    res.json({ ok: true });
  } catch (e) {
    console.error('Square webhook error:', e);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// POST /webhooks/replay — admin tool to reprocess missed Square orders
router.post('/replay', requireAuth, async (req, res) => {
  try {
    const { order_ids } = req.body;
    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      return res.status(400).json({ error: 'order_ids array required' });
    }

    const settings = await getSquareSettings();
    const results = [];

    for (const orderId of order_ids) {
      try {
        const result = await processOrderId(orderId.trim(), settings);
        results.push({ ...result, ok: true });
      } catch (e) {
        results.push({ orderId, ok: false, error: e.message });
      }
    }

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
