import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── CSV export (must be before /:id style routes) ─────────
router.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = (col) =>
      `($1::date IS NULL OR ${col} >= $1::date) AND ($2::date IS NULL OR ${col} <= $2::date)`;

    const [incomeRes, expenseRes, donationRes] = await Promise.all([
      query(
        `SELECT i.date, 'Income' AS type, i.source AS source_category,
                i.description, e.event_name, i.amount
         FROM income_entries i
         LEFT JOIN events e ON i.event_id = e.id
         WHERE ${dateFilter('i.date')}
         ORDER BY i.date DESC`,
        [from || null, to || null]
      ),
      query(
        `SELECT date, 'Expense' AS type, category AS source_category,
                description, NULL AS event_name, amount
         FROM expense_entries
         WHERE ${dateFilter('date')}
         ORDER BY date DESC`,
        [from || null, to || null]
      ),
      query(
        `SELECT d.donated_at AS date, 'Donation' AS type,
                ib.item_name AS source_category,
                NULL AS description, e.event_name,
                (d.quantity * d.unit_value) AS amount
         FROM donations d
         LEFT JOIN item_builder ib ON d.item_builder_id = ib.id
         LEFT JOIN events e ON d.event_id = e.id
         WHERE ${dateFilter('d.donated_at')}
         ORDER BY d.donated_at DESC`,
        [from || null, to || null]
      ),
    ]);

    const rows = [...incomeRes.rows, ...expenseRes.rows, ...donationRes.rows]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const lines = [
      'Date,Type,Source / Category,Description,Event,Amount',
      ...rows.map(r => [
        r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        esc(r.type),
        esc(r.source_category),
        esc(r.description),
        esc(r.event_name),
        Number(r.amount || 0).toFixed(2),
      ].join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="income-expenses.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Income ────────────────────────────────────────────────
router.get('/income', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT i.*, e.event_name
       FROM income_entries i
       LEFT JOIN events e ON i.event_id = e.id
       ORDER BY i.date DESC, i.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/income', async (req, res) => {
  try {
    const { source, amount, date, event_id, description, notes } = req.body;
    if (!source || !amount || !date) return res.status(400).json({ error: 'source, amount, and date are required' });
    const { rows } = await query(
      `INSERT INTO income_entries (source, amount, date, event_id, description, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [source, amount, date, event_id || null, description || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/income/:id', async (req, res) => {
  try {
    const { source, amount, date, event_id, description, notes } = req.body;
    const { rows } = await query(
      `UPDATE income_entries SET source=$1, amount=$2, date=$3, event_id=$4,
              description=$5, notes=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [source, amount, date, event_id || null, description || null, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/income/:id', async (req, res) => {
  try {
    await query('DELETE FROM income_entries WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Expenses ──────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM expense_entries ORDER BY date DESC, created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const { category, amount, date, description, notes } = req.body;
    if (!category || !amount || !date) return res.status(400).json({ error: 'category, amount, and date are required' });
    const { rows } = await query(
      `INSERT INTO expense_entries (category, amount, date, description, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [category, amount, date, description || null, notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const { category, amount, date, description, notes } = req.body;
    const { rows } = await query(
      `UPDATE expense_entries SET category=$1, amount=$2, date=$3,
              description=$4, notes=$5, updated_at=now()
       WHERE id=$6 RETURNING *`,
      [category, amount, date, description || null, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    await query('DELETE FROM expense_entries WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
