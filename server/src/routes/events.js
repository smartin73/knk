import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /events
router.get('/', async (req, res) => {
  const { search, status, from, to, limit = 100, offset = 0 } = req.query;
  const where = ['1=1']; const params = [];
  let i = 1;
  if (search)  { where.push(`(event_name ILIKE $${i} OR location ILIKE $${i})`); params.push(`%${search}%`); i++; }
  if (status)  { where.push(`status = $${i++}`); params.push(status); }
  if (from)    { where.push(`event_date >= $${i++}`); params.push(from); }
  if (to)      { where.push(`event_date <= $${i++}`); params.push(to); }
  params.push(parseInt(limit), parseInt(offset));
  const { rows } = await query(
    `SELECT e.*, v.vendor_name FROM events e
     LEFT JOIN event_vendors v ON e.vendor_id = v.id
     WHERE ${where.join(' AND ')} ORDER BY event_date DESC
     LIMIT $${i} OFFSET $${i+1}`, params
  );
  res.json(rows);
});

// GET /events/:id
router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, v.vendor_name, v.logo_url as vendor_logo
     FROM events e LEFT JOIN event_vendors v ON e.vendor_id = v.id
     WHERE e.id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// POST /events/repeat — generate recurring copies of an event
router.post('/repeat', async (req, res) => {
  try {
    const { event_id, frequency, until } = req.body;
    if (!event_id || !frequency || !until) {
      return res.status(400).json({ error: 'event_id, frequency, and until are required' });
    }

    const { rows } = await query('SELECT * FROM events WHERE id = $1', [event_id]);
    const src = rows[0];
    if (!src) return res.status(404).json({ error: 'Event not found' });

    const startDate = new Date(src.event_date);
    const endDate   = new Date(until);
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'Until date must be after the event date' });
    }

    const stepDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : null;

    function nextDate(d) {
      const n = new Date(d);
      if (stepDays) {
        n.setDate(n.getDate() + stepDays);
      } else {
        // monthly: same day, next month
        n.setMonth(n.getMonth() + 1);
      }
      return n;
    }

    const dates = [];
    let cur = nextDate(startDate);
    while (cur <= endDate) {
      dates.push(cur.toISOString().slice(0, 10));
      cur = nextDate(cur);
    }

    if (dates.length === 0) {
      return res.status(400).json({ error: 'No occurrences fall within the selected range' });
    }

    for (const d of dates) {
      await query(
        `INSERT INTO events (vendor_id,event_name,event_date,start_time,end_time,
          location,description,image_url,ticket_url,map_embed,category,tags,price,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [src.vendor_id,src.event_name,d,src.start_time,src.end_time,
         src.location,src.description,src.image_url,src.ticket_url,src.map_embed,
         src.category,src.tags,src.price,'draft']
      );
    }

    res.json({ created: dates.length, dates });
  } catch (e) {
    console.error('Repeat event error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /events
router.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO events (vendor_id,event_name,event_date,start_time,end_time,
      location,description,image_url,ticket_url,map_embed,category,tags,price,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [f.vendor_id || null,f.event_name,f.event_date,f.start_time,f.end_time,
     f.location,f.description,f.image_url,f.ticket_url,f.map_embed,
     f.category,f.tags,f.price,f.status||'draft']
  );
  res.status(201).json(rows[0]);
});

// PUT /events/:id
router.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE events SET vendor_id=$1,event_name=$2,event_date=$3,start_time=$4,
      end_time=$5,location=$6,description=$7,image_url=$8,ticket_url=$9,
      map_embed=$10,category=$11,tags=$12,price=$13,status=$14
     WHERE id=$15 RETURNING *`,
    [f.vendor_id || null,f.event_name,f.event_date,f.start_time,f.end_time,
     f.location,f.description,f.image_url,f.ticket_url,f.map_embed,
     f.category,f.tags,f.price,f.status,req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /events/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT
        (SELECT COUNT(*) FROM donations WHERE event_id=$1)::int AS donation_count,
        (SELECT COUNT(*) FROM income_entries WHERE event_id=$1)::int AS income_count`,
      [req.params.id]
    );
    const { donation_count, income_count } = rows[0];
    if (donation_count > 0 || income_count > 0) {
      return res.status(400).json({
        error: `This event has ${donation_count > 0 ? `${donation_count} donation(s)` : ''}${donation_count > 0 && income_count > 0 ? ' and ' : ''}${income_count > 0 ? `${income_count} sales entry(s)` : ''} logged. Mark it as Cancelled instead.`,
      });
    }
    await query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
