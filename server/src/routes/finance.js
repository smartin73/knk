import { Router } from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { requireAuth, requireFinanceAccess } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireFinanceAccess);

// ── Summary aggregations ──────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !ISO.test(from)) || (to && !ISO.test(to)))
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });

    const p = [from || null, to || null];
    const df = col => `($1::date IS NULL OR ${col} >= $1::date) AND ($2::date IS NULL OR ${col} <= $2::date)`;

    const [inc, incSrc, exp, expCat, don, series] = await Promise.all([
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM income_entries WHERE ${df('date')}`, p),
      query(`SELECT source, COALESCE(SUM(amount),0) AS total FROM income_entries WHERE ${df('date')} GROUP BY source ORDER BY total DESC`, p),
      query(`SELECT COALESCE(SUM(amount),0) AS total FROM expense_entries WHERE ${df('date')}`, p),
      query(`SELECT category, COALESCE(SUM(amount),0) AS total FROM expense_entries WHERE ${df('date')} GROUP BY category ORDER BY total DESC`, p),
      query(`SELECT COALESCE(SUM(quantity * unit_value),0) AS total FROM donations WHERE ${df('donated_at')}`, p),
      query(`SELECT month, SUM(income) AS income, SUM(expenses) AS expenses FROM (
               SELECT DATE_TRUNC('month', date) AS month, SUM(amount) AS income, 0 AS expenses FROM income_entries WHERE ${df('date')} GROUP BY 1
               UNION ALL
               SELECT DATE_TRUNC('month', date) AS month, 0 AS income, SUM(amount) AS expenses FROM expense_entries WHERE ${df('date')} GROUP BY 1
             ) t GROUP BY month ORDER BY month`, p),
    ]);

    const totalIncome   = Number(inc.rows[0].total);
    const totalExpenses = Number(exp.rows[0].total);
    res.json({
      totalIncome,
      totalExpenses,
      totalDonations: Number(don.rows[0].total),
      net: totalIncome - totalExpenses,
      incomeBySource:     incSrc.rows.map(r => ({ source: r.source, total: Number(r.total) })),
      expensesByCategory: expCat.rows.map(r => ({ category: r.category, total: Number(r.total) })),
      timeSeries: series.rows.map(r => ({
        month:    r.month.toISOString().slice(0, 7),
        income:   Number(r.income),
        expenses: Number(r.expenses),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── Event / item charts ───────────────────────────────────
router.get('/revenue-by-event', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT e.event_name, COALESCE(SUM(i.amount), 0) AS revenue
      FROM events e
      LEFT JOIN income_entries i ON i.event_id = e.id
      WHERE e.status = 'completed'
      GROUP BY e.id, e.event_name, e.event_date
      ORDER BY e.event_date DESC
      LIMIT 10
    `);
    res.json(rows.map(r => ({ event_name: r.event_name, revenue: Number(r.revenue) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/top-items', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ib.item_name,
             SUM(GREATEST(0, emi.qty_initial - emi.qty_on_hand)) AS qty_sold
      FROM event_menu_items emi
      JOIN item_builder ib ON emi.item_builder_id = ib.id
      JOIN events e ON emi.event_id = e.id
      WHERE e.status = 'completed'
        AND emi.qty_initial IS NOT NULL
        AND emi.qty_on_hand IS NOT NULL
      GROUP BY ib.id, ib.item_name
      ORDER BY qty_sold DESC
      LIMIT 10
    `);
    res.json(rows.map(r => ({ item_name: r.item_name, qty_sold: Number(r.qty_sold) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/donations-vs-sales', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        e.event_name,
        COALESCE(SUM(i.amount), 0) AS sales,
        COALESCE((
          SELECT SUM(d.quantity * d.unit_value)
          FROM donations d WHERE d.event_id = e.id
        ), 0) AS donations
      FROM events e
      LEFT JOIN income_entries i ON i.event_id = e.id
      WHERE e.status = 'completed'
      GROUP BY e.id, e.event_name, e.event_date
      ORDER BY e.event_date DESC
      LIMIT 10
    `);
    res.json(rows.map(r => ({
      event_name: r.event_name,
      sales:     Number(r.sales),
      donations: Number(r.donations),
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

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
    const { category, amount, date, vendor, description, notes, receipt_url } = req.body;
    if (!category || !amount || !date) return res.status(400).json({ error: 'category, amount, and date are required' });
    const { rows } = await query(
      `INSERT INTO expense_entries (category, amount, date, vendor, description, notes, receipt_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [category, amount, date, vendor || null, description || null, notes || null, receipt_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const { category, amount, date, vendor, description, notes, receipt_url } = req.body;
    const { rows } = await query(
      `UPDATE expense_entries SET category=$1, amount=$2, date=$3, vendor=$4,
              description=$5, notes=$6, receipt_url=$7, updated_at=now()
       WHERE id=$8 RETURNING *`,
      [category, amount, date, vendor || null, description || null, notes || null, receipt_url || null, req.params.id]
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

// ── Receipt / CSV import helpers ──────────────────────────
const EXPENSE_CATS = ['Ingredients', 'Packaging', 'Supplies', 'Equipment', 'Fees', 'Event Fees', 'Marketing', 'Utilities', 'Labor', 'Other'];

const VENDOR_CATEGORIES = {
  'restaurant depot': 'Ingredients',
  "bj's": 'Ingredients',
  'walmart': 'Ingredients',
  'aldi': 'Ingredients',
  'costco': 'Ingredients',
  'amazon': 'Supplies',
};

function suggestCategory(vendor, aiCategory) {
  if (vendor) {
    const v = vendor.toLowerCase();
    for (const [name, cat] of Object.entries(VENDOR_CATEGORIES)) {
      if (v.includes(name)) return cat;
    }
  }
  if (aiCategory && EXPENSE_CATS.includes(aiCategory)) return aiCategory;
  return 'Other';
}

async function getCloudinarySettings() {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE key IN ('cloudinary_cloud_name', 'cloudinary_upload_preset')`
  );
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  return { cloudName: map.cloudinary_cloud_name, uploadPreset: map.cloudinary_upload_preset };
}

async function uploadToCloudinary(buffer, mimeType, filename, cloudName, uploadPreset) {
  const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mimeType }), filename);
  fd.append('upload_preset', uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: 'POST', body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed');
  return data.secure_url;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function findColIdx(headers, ...opts) {
  for (const opt of opts) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(opt.toLowerCase()));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ── Parse receipt (photo or PDF) ──────────────────────────
const parseUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/parse-receipt', parseUpload.array('files', 10), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded.' });

    const { rows: keyRows } = await query(`SELECT value FROM settings WHERE key='anthropic_api_key' LIMIT 1`);
    const apiKey = keyRows[0]?.value;
    if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured. Add it in Settings → Integrations → Anthropic.' });

    const SUPPORTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    for (const f of req.files) {
      if (!SUPPORTED.includes(f.mimetype)) {
        return res.status(400).json({ error: `Unsupported file type: ${f.mimetype}. Use JPEG, PNG, or PDF. For iPhone photos, share as JPEG.` });
      }
    }

    // Upload first file to Cloudinary (non-fatal if it fails)
    let receipt_url = null;
    try {
      const { cloudName, uploadPreset } = await getCloudinarySettings();
      if (cloudName && uploadPreset) {
        receipt_url = await uploadToCloudinary(
          req.files[0].buffer, req.files[0].mimetype,
          req.files[0].originalname, cloudName, uploadPreset
        );
      }
    } catch (e) {
      console.error('Cloudinary upload failed (non-fatal):', e.message);
    }

    // Build Anthropic content blocks (one per file)
    const contentBlocks = req.files.map(f => {
      if (f.mimetype === 'application/pdf') {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.buffer.toString('base64') } };
      }
      return { type: 'image', source: { type: 'base64', media_type: f.mimetype, data: f.buffer.toString('base64') } };
    });
    contentBlocks.push({
      type: 'text',
      text: `You are parsing a receipt or invoice for business expense tracking.
Extract the following fields and return ONLY valid JSON, no markdown, no preamble:

{
  "vendor": "store or supplier name",
  "date": "YYYY-MM-DD",
  "amount": total amount as a number,
  "category": one of ${JSON.stringify(EXPENSE_CATS)},
  "line_items": []
}

If a field cannot be determined, use null.
Focus on: vendor name, purchase date, and total amount paid.`,
    });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic API error ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData.content?.[0]?.text || '{}';
    let parsed = {};
    try { parsed = JSON.parse(rawText); } catch { parsed = {}; }

    parsed.category = suggestCategory(parsed.vendor, parsed.category);
    res.json({ parsed, receipt_url });
  } catch (e) {
    console.error('parse-receipt error:', e);
    res.status(500).json({ error: e.message || 'Receipt parsing failed.' });
  }
});

// ── Amazon Business CSV import ────────────────────────────
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/import-amazon-csv', csvUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV appears empty.' });

    const headers = parseCSVLine(lines[0]);
    const dateIdx   = findColIdx(headers, 'order date', 'date');
    const vendorIdx = findColIdx(headers, 'seller', 'vendor', 'supplier');
    const amountIdx = findColIdx(headers, 'item total', 'total charged', 'order total', 'amount');
    const titleIdx  = findColIdx(headers, 'title', 'item name', 'description', 'product name');

    if (dateIdx === -1 || amountIdx === -1) {
      return res.status(400).json({ error: 'Could not find required columns (date, amount). Make sure this is an Amazon Business order history export.' });
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length < 2) continue;

      const rawAmount = (cols[amountIdx] || '').replace(/[$,]/g, '');
      const amount = parseFloat(rawAmount);
      if (isNaN(amount) || amount <= 0) continue;

      let date = (cols[dateIdx] || '').trim();
      if (date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) date = d.toISOString().split('T')[0];
      }
      if (!date) continue;

      const vendor = vendorIdx !== -1 ? (cols[vendorIdx]?.trim() || 'Amazon') : 'Amazon';
      const title  = titleIdx  !== -1 ? (cols[titleIdx]?.trim().slice(0, 200) || '') : '';

      rows.push({
        date, vendor, amount,
        category: suggestCategory(vendor, null),
        description: title || `Amazon order`,
        notes: '',
        receipt_url: null,
      });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'No valid expense rows found in this CSV.' });
    res.json({ rows });
  } catch (e) {
    console.error('import-amazon-csv error:', e);
    res.status(500).json({ error: e.message || 'CSV import failed.' });
  }
});

router.post('/import-amazon-csv/confirm', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import.' });

    let inserted = 0;
    let skipped  = 0;
    for (const row of rows) {
      // Skip duplicates: same date + amount + description
      const { rows: existing } = await query(
        `SELECT id FROM expense_entries WHERE date=$1 AND amount=$2 AND description=$3 LIMIT 1`,
        [row.date, row.amount, row.description]
      );
      if (existing.length > 0) { skipped++; continue; }

      await query(
        `INSERT INTO expense_entries (category, amount, date, vendor, description, notes, receipt_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [row.category, row.amount, row.date, row.vendor || null,
         row.description || null, row.notes || null, row.receipt_url || null]
      );
      inserted++;
    }
    res.json({ inserted, skipped });
  } catch (e) {
    console.error('import-amazon-csv/confirm error:', e);
    res.status(500).json({ error: e.message || 'Import failed.' });
  }
});

export default router;
