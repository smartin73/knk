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
      map_embed=$10,category=$11,tags=$12,price=$13,status=$14,posted_to_web=$15
     WHERE id=$16 RETURNING *`,
    [f.vendor_id || null,f.event_name,f.event_date,f.start_time,f.end_time,
     f.location,f.description,f.image_url,f.ticket_url,f.map_embed,
     f.category,f.tags,f.price,f.status,f.posted_to_web,req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /events/:id
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM events WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
