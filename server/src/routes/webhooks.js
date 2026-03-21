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

    // ── Persist income entry (idempotent via reference_id) ──────────────────
    const paymentId   = payment.id;
    const amountCents = payment.total_money?.amount;
    const paymentDate = payment.created_at
      ? payment.created_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    if (paymentId && amountCents != null) {
      const { rowCount: alreadyExists } = await query(
        'SELECT 1 FROM income_entries WHERE reference_id = $1',
        [paymentId]
      );
      if (alreadyExists === 0) {
        // Find the active event (event with an active menu, not yet completed)
        const { rows: activeEvents } = await query(`
          SELECT DISTINCT e.id FROM events e
          JOIN event_menus em ON em.event_id = e.id
          WHERE em.is_active = true AND e.status != 'completed'
          LIMIT 1
        `);
        const eventId = activeEvents[0]?.id || null;

        await query(
          `INSERT INTO income_entries (source, amount, date, event_id, description, reference_id)
           VALUES ('square', $1, $2, $3, 'Square Sale', $4)`,
          [(amountCents / 100).toFixed(2), paymentDate, eventId, paymentId]
        );
        console.log('[webhook] income_entries inserted — payment', paymentId, 'amount', (amountCents / 100).toFixed(2), 'event', eventId);
      } else {
        console.log('[webhook] income_entries already exists for payment', paymentId, '— skipping');
      }
    }

    // ── Decrement event_menu_items qty_on_hand ───────────────────────────────
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
