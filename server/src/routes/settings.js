import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM settings ORDER BY category, key');
  res.json(rows);
});

router.put('/:key', async (req, res) => {
  const { value } = req.body;
  const { rows } = await query(
    `INSERT INTO settings (key, value, category, label, description, is_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
     RETURNING *`,
    [req.params.key, value, req.body.category, req.body.label, req.body.description, req.body.is_encrypted || false]
  );
  res.json(rows[0]);
});

export default router;