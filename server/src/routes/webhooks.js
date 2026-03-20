import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../db/pool.js';

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

// POST /webhooks/square — receives Square sale events, decrements qty_on_hand
router.post('/square', async (req, res) => {
  try {
    const settings = await getSquareSettings();
    const webhookKey = settings.square_webhook_key;

    // Verify signature if key is configured
    if (webhookKey) {
      const signature = req.headers['x-square-hmacsha256-signature'];
      const notificationUrl = `${req.protocol}://${req.get('host')}/webhooks/square`;
      if (!signature || !verifySignature(req.rawBody, signature, webhookKey, notificationUrl)) {
        console.error('Square webhook signature mismatch. URL used:', notificationUrl);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const eventType = req.body.type;
    const payment = req.body.data?.object?.payment;

    // Only process payments that have reached COMPLETED status
    if (eventType !== 'payment.updated' || payment?.status !== 'COMPLETED') {
      return res.json({ ok: true, skipped: true });
    }

    const orderId = payment?.order_id;
    if (!orderId) return res.json({ ok: true, skipped: true });

    // Fetch the order from Square to get line items with variation IDs
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
      console.error('Square order fetch failed:', await orderRes.text());
      return res.json({ ok: true, skipped: true });
    }

    const orderData = await orderRes.json();
    const lineItems = orderData.order?.line_items || [];

    // Decrement qty_on_hand for each sold item in any active menu
    for (const item of lineItems) {
      const variationId = item.catalog_object_id;
      if (!variationId) continue;

      const qty = parseInt(item.quantity || '1', 10);

      await query(
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
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Square webhook error:', e);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
