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
    `SELECT key, value, is_encrypted FROM settings WHERE key IN ('wordpress_site_url', 'wordpress_api_key')`
  );
  const map = {};
  for (const r of rows) {
    map[r.key] = r.is_encrypted ? decrypt(r.value) : r.value;
  }
  return {
    siteUrl: (map.wordpress_site_url || '').replace(/\/$/, ''),
    apiKey:  map.wordpress_api_key || '',
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
    const payload = {
      title:       event.event_name,
      description: event.description  || '',
      event_date:  event.event_date   ? String(event.event_date).slice(0, 10) : null,
      event_time:  event.start_time   ? String(event.start_time).slice(0, 5)  : null,
      location:    event.location     || '',
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
