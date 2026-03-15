import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

const ENCRYPT_KEY = process.env.SETTINGS_ENCRYPT_KEY || process.env.SESSION_SECRET || 'fallback-key-32-chars-minimum!!!';

function decrypt(encrypted) {
  if (!encrypted) return '';
  try {
    const [ivHex, authTagHex, ciphertext] = encrypted.split(':');
    const key = crypto.scryptSync(ENCRYPT_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return encrypted; // not encrypted, return as-is
  }
}

async function getWpSettings() {
  const { rows } = await query(
    `SELECT key, value, is_encrypted FROM settings WHERE key IN ('wordpress_site_url', 'wordpress_api_key', 'woo_consumer_key', 'woo_consumer_secret')`
  );
  const map = {};
  for (const r of rows) {
    map[r.key] = r.is_encrypted ? decrypt(r.value) : r.value;
  }
  return {
    siteUrl:        (map.wordpress_site_url || '').replace(/\/$/, ''),
    apiKey:          map.wordpress_api_key    || '',
    wooConsumerKey:  map.woo_consumer_key     || '',
    wooConsumerSecret: map.woo_consumer_secret || '',
  };
}

// POST /wordpress/push/:eventId — create or update event in WordPress
router.post('/push/:eventId', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);
    const event = rows[0];
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const { siteUrl, apiKey } = await getWpSettings();
    if (!siteUrl) return res.status(400).json({ error: 'WordPress site URL not configured in Settings' });
    if (!apiKey)  return res.status(400).json({ error: 'WordPress API key not configured in Settings' });

    // Map knk fields → WP plugin fields
    const fmtDate = v => v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null;
    const fmtTime = v => v ? String(v).slice(0, 5) : null;

    const payload = {
      title:       event.event_name,
      description: event.description  || '',
      event_date:  fmtDate(event.event_date),
      event_time:  fmtTime(event.start_time),
      end_time:    fmtTime(event.end_time),
      location:    event.location     || '',
      map_embed:   event.map_embed    || '',
      image_url:   event.image_url    || '',
      ticket_url:  event.ticket_url   || '',
      category:    event.category     || '',
      tags:        event.tags         || '',
      price:       event.price        ? String(event.price) : '',
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-SE-API-Key': apiKey,
    };

    let wpResponse;
    if (event.woo_id) {
      // Update existing
      wpResponse = await fetch(`${siteUrl}/wp-json/simple-events/v1/events/${event.woo_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
    } else {
      // Create new
      wpResponse = await fetch(`${siteUrl}/wp-json/simple-events/v1/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    }

    if (!wpResponse.ok) {
      const text = await wpResponse.text();
      return res.status(502).json({ error: `WordPress returned ${wpResponse.status}: ${text}` });
    }

    const wpEvent = await wpResponse.json();
    const wpId = String(wpEvent.id);

    // Save woo_id back to knk event
    await query('UPDATE events SET woo_id = $1 WHERE id = $2', [wpId, event.id]);

    res.json({ ok: true, woo_id: wpId });
  } catch (e) {
    console.error('WP push error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /wordpress/push-item/:id — create or update item in WooCommerce
router.post('/push-item/:id', async (req, res) => {
  try {
    const itemRes = await query(
      `SELECT ib.*, array_agg(
        json_build_object(
          'id', iv.id,
          'variant_name', iv.variant_name,
          'price_override', iv.price_override,
          'is_active', iv.is_active
        ) ORDER BY iv.sort_order
      ) FILTER (WHERE iv.id IS NOT NULL) AS variants
      FROM item_builder ib
      LEFT JOIN item_variants iv ON iv.item_builder_id = ib.id AND iv.is_active = true
      WHERE ib.id = $1
      GROUP BY ib.id`,
      [req.params.id]
    );
    const item = itemRes.rows[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { siteUrl, wooConsumerKey, wooConsumerSecret } = await getWpSettings();
    if (!siteUrl)           return res.status(400).json({ error: 'WordPress site URL not configured in Settings' });
    if (!wooConsumerKey)    return res.status(400).json({ error: 'WooCommerce Consumer Key not configured in Settings' });
    if (!wooConsumerSecret) return res.status(400).json({ error: 'WooCommerce Consumer Secret not configured in Settings' });

    const auth = 'Basic ' + Buffer.from(`${wooConsumerKey}:${wooConsumerSecret}`).toString('base64');
    const headers = { 'Content-Type': 'application/json', Authorization: auth };
    const variants = item.variants || [];

    let wooRes, wooProduct;

    if (variants.length > 0) {
      // Variable product — push as 'variable' with variations
      const payload = {
        name:              item.item_name,
        type:              'variable',
        description:       item.description || '',
        short_description: item.description || '',
        regular_price:     item.retail_price ? String(item.retail_price) : '',
        images:            item.image_url ? [{ src: item.image_url }] : [],
        attributes: [{ name: 'Option', options: variants.map(v => v.variant_name), variation: true, visible: true }],
      };

      if (item.woo_id) {
        wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/products/${item.woo_id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      } else {
        wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/products`, { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      if (!wooRes.ok) {
        const text = await wooRes.text();
        return res.status(502).json({ error: `WooCommerce returned ${wooRes.status}: ${text}` });
      }
      wooProduct = await wooRes.json();
      const productId = String(wooProduct.id);

      // Sync variations
      const existingRes = await fetch(`${siteUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=100`, { headers });
      const existing = existingRes.ok ? await existingRes.json() : [];
      for (const variant of variants) {
        const varPayload = {
          regular_price: variant.price_override ? String(variant.price_override) : (item.retail_price ? String(item.retail_price) : ''),
          attributes: [{ name: 'Option', option: variant.variant_name }],
        };
        const existingVar = existing.find(e => e.attributes?.[0]?.option === variant.variant_name);
        if (existingVar) {
          await fetch(`${siteUrl}/wp-json/wc/v3/products/${productId}/variations/${existingVar.id}`, { method: 'PUT', headers, body: JSON.stringify(varPayload) });
        } else {
          await fetch(`${siteUrl}/wp-json/wc/v3/products/${productId}/variations`, { method: 'POST', headers, body: JSON.stringify(varPayload) });
        }
      }

      await query('UPDATE item_builder SET woo_id = $1 WHERE id = $2', [productId, item.id]);
      return res.json({ ok: true, woo_id: productId });

    } else {
      // Simple product
      const payload = {
        name:              item.item_name,
        type:              'simple',
        description:       item.description || '',
        short_description: item.description || '',
        regular_price:     item.retail_price ? String(item.retail_price) : '',
        images:            item.image_url ? [{ src: item.image_url }] : [],
      };

      if (item.woo_id) {
        wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/products/${item.woo_id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      } else {
        wooRes = await fetch(`${siteUrl}/wp-json/wc/v3/products`, { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      if (!wooRes.ok) {
        const text = await wooRes.text();
        return res.status(502).json({ error: `WooCommerce returned ${wooRes.status}: ${text}` });
      }
      wooProduct = await wooRes.json();
      const productId = String(wooProduct.id);

      await query('UPDATE item_builder SET woo_id = $1 WHERE id = $2', [productId, item.id]);
      return res.json({ ok: true, woo_id: productId });
    }
  } catch (e) {
    console.error('WP push-item error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /wordpress/unlink/:eventId — clear woo_id (does not delete from WP)
router.delete('/unlink/:eventId', async (req, res) => {
  try {
    await query('UPDATE events SET woo_id = NULL WHERE id = $1', [req.params.eventId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('WP unlink error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
