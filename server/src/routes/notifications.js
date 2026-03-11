import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// POST /notifications/send
router.post('/send', async (req, res) => {
  const { title, message } = req.body;
  try {
    const { rows } = await query(
      `SELECT key, value FROM settings WHERE key IN ('pushover_api_token', 'pushover_user_key')`
    );
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });

    if (!map.pushover_api_token || !map.pushover_user_key) {
      return res.status(400).json({ error: 'Pushover not configured in Settings.' });
    }

    const body = new URLSearchParams({
      token:   map.pushover_api_token,
      user:    map.pushover_user_key,
      title:   title   || 'Knife & Knead',
      message: message || '',
    });

    const pushRes = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await pushRes.json();
    if (data.status !== 1) throw new Error(data.errors?.join(', ') || 'Pushover error');

    res.json({ ok: true });
  } catch (e) {
    console.error('Pushover error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
