// ── Ingredients ──────────────────────────────────────────
import { Router as IngRouter } from 'express';
import pool, { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const ingredientsRouter = IngRouter();
ingredientsRouter.use(requireAuth);

ingredientsRouter.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM ingredient_items WHERE is_active=true ORDER BY item_name');
  res.json(rows);
});
// GET /ingredients/duplicates — find potential duplicate names via substring containment
ingredientsRouter.get('/duplicates', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.*, COUNT(ri.id)::int AS recipe_count
      FROM ingredient_items i
      LEFT JOIN recipe_ingredients ri ON ri.ingredient_id = i.id
      WHERE i.is_active = true
      GROUP BY i.id
      ORDER BY i.item_name
    `);

    function normalize(name) {
      return name.toLowerCase().trim().replace(/\s+/g, ' ');
    }

    const groups = [];
    const used = new Set();
    for (let i = 0; i < rows.length; i++) {
      if (used.has(rows[i].id)) continue;
      const normI = normalize(rows[i].item_name);
      const group = [rows[i]];
      for (let j = i + 1; j < rows.length; j++) {
        if (used.has(rows[j].id)) continue;
        const normJ = normalize(rows[j].item_name);
        if (normI.includes(normJ) || normJ.includes(normI)) {
          group.push(rows[j]);
          used.add(rows[j].id);
        }
      }
      if (group.length > 1) {
        used.add(rows[i].id);
        groups.push(group);
      }
    }
    res.json(groups);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /ingredients/merge — re-point recipe_ingredients from discard to keep, soft-delete discard
ingredientsRouter.post('/merge', async (req, res) => {
  const { keep_id, discard_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE recipe_ingredients SET ingredient_id = $1 WHERE ingredient_id = $2',
      [keep_id, discard_id]
    );
    await client.query(
      'UPDATE ingredient_items SET is_active = false WHERE id = $1',
      [discard_id]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

ingredientsRouter.get('/:id', async (req, res) => {
  const [item, history] = await Promise.all([
    query('SELECT * FROM ingredient_items WHERE id=$1', [req.params.id]),
    query('SELECT * FROM ingredient_price_history WHERE ingredient_id=$1 ORDER BY recorded_at DESC', [req.params.id]),
  ]);
  if (!item.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...item.rows[0], price_history: history.rows });
});
ingredientsRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO ingredient_items (item_name,purchase_from,grams,current_price)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [f.item_name, f.purchase_from, f.grams, f.current_price]
  );
  if (f.current_price) {
    await query('INSERT INTO ingredient_price_history (ingredient_id,price) VALUES ($1,$2)',
      [rows[0].id, f.current_price]);
  }
  res.status(201).json(rows[0]);
});
ingredientsRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE ingredient_items SET item_name=$1,purchase_from=$2,grams=$3,current_price=$4
     WHERE id=$5 RETURNING *`,
    [f.item_name, f.purchase_from, f.grams, f.current_price, req.params.id]
  );
  if (f.current_price) {
    await query('INSERT INTO ingredient_price_history (ingredient_id,price) VALUES ($1,$2)',
      [req.params.id, f.current_price]);
  }
  res.json(rows[0]);
});
ingredientsRouter.delete('/:id', async (req, res) => {
  await query('UPDATE ingredient_items SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── Item Builder ─────────────────────────────────────────
import { Router as IbRouter } from 'express';
export const itemBuilderRouter = IbRouter();
itemBuilderRouter.use(requireAuth);

itemBuilderRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ib.* FROM item_builder ib WHERE ib.is_active=true ORDER BY ib.item_name`
  );
  res.json(rows);
});

// POST /items/import
itemBuilderRouter.post('/import', async (req, res) => {
  const { items, components } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert items
    for (const item of items) {
      await client.query(
        `INSERT INTO item_builder (item_name,description,batch_qty,retail_price,
          include_packaging,include_fees,packaging_cost,square_fee,square_fee_online,
          food_cook_time,ingredient_label,contains_label,image_url,square_id,woo_id,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [item.item_name, item.description||null, item.batch_qty||1, item.retail_price||null,
         item.include_packaging||false, item.include_fees||false,
         item.packaging_cost||null, item.square_fee||null, item.square_fee_online||null,
         item.food_cook_time||null, item.ingredient_label||null, item.contains_label||null,
         item.image_url||null, item.square_id||null, item.woo_id||null, true]
      );
    }

    // Insert components if provided
    if (Array.isArray(components) && components.length > 0) {
      // Build lookup maps
      const { rows: ibRows } = await client.query('SELECT id, item_name FROM item_builder');
      const { rows: recipeRows } = await client.query('SELECT id, recipe_name FROM recipes');
      const { rows: ingRows } = await client.query('SELECT id, item_name FROM ingredient_items');

      const ibMap  = Object.fromEntries(ibRows.map(r => [r.item_name.toLowerCase(), r.id]));
      const recMap = Object.fromEntries(recipeRows.map(r => [r.recipe_name.toLowerCase(), r.id]));
      const ingMap = Object.fromEntries(ingRows.map(r => [r.item_name.toLowerCase(), r.id]));

      for (let i = 0; i < components.length; i++) {
        const c = components[i];
        const ibId = ibMap[c.item_name?.toLowerCase()];
        if (!ibId) continue; // item not found, skip

        const isRecipe = (c.component_type || '').toLowerCase() === 'recipe';
        const recipeId = isRecipe ? (recMap[c.component_name?.toLowerCase()] || null) : null;
        const ingId    = !isRecipe ? (ingMap[c.component_name?.toLowerCase()] || null) : null;

        await client.query(
          `INSERT INTO item_builder_items (item_builder_id, recipe_id, ingredient_id, item_name, quantity, unit, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ibId, recipeId, ingId, c.component_name || null, parseFloat(c.quantity) || 1, c.unit || null, i]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

itemBuilderRouter.get('/:id', async (req, res) => {
  try {
    const [item, items, variants] = await Promise.all([
      query('SELECT * FROM item_builder WHERE id=$1', [req.params.id]),
      query(
        `SELECT ibi.*,
          r.recipe_name, r.serving_size,
          ii.item_name as ingredient_name, ii.cost_per_gram
         FROM item_builder_items ibi
         LEFT JOIN recipes r ON ibi.recipe_id = r.id
         LEFT JOIN ingredient_items ii ON ibi.ingredient_id = ii.id
         WHERE ibi.item_builder_id=$1 ORDER BY ibi.sort_order`,
        [req.params.id]
      ),
      query(
        'SELECT * FROM item_variants WHERE item_builder_id=$1 ORDER BY sort_order',
        [req.params.id]
      ),
    ]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...item.rows[0], items: items.rows, variants: variants.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

itemBuilderRouter.post('/', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await query(
      `INSERT INTO item_builder (item_name,description,batch_qty,retail_price,
        include_packaging,include_fees,packaging_cost,square_fee,square_fee_online,
        food_cook_time,ingredient_label,contains_label,image_url,square_id,woo_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [f.item_name,f.description,f.batch_qty||1,f.retail_price,
       f.include_packaging||false,f.include_fees||false,
       f.packaging_cost||null,f.square_fee||null,f.square_fee_online||null,
       f.food_cook_time||null,f.ingredient_label,f.contains_label,
       f.image_url,f.square_id||null,f.woo_id||null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

itemBuilderRouter.put('/:id', async (req, res) => {
  try {
    const f = req.body;
    const { rows } = await query(
      `UPDATE item_builder SET item_name=$1,description=$2,batch_qty=$3,
        retail_price=$4,include_packaging=$5,include_fees=$6,
        packaging_cost=$7,square_fee=$8,square_fee_online=$9,
        food_cook_time=$10,ingredient_label=$11,contains_label=$12,
        image_url=$13,square_id=$14,woo_id=$15 WHERE id=$16 RETURNING *`,
      [f.item_name,f.description,f.batch_qty,f.retail_price,
       f.include_packaging,f.include_fees,
       f.packaging_cost||null,f.square_fee||null,f.square_fee_online||null,
       f.food_cook_time||null,f.ingredient_label,f.contains_label,
       f.image_url,f.square_id||null,f.woo_id||null,req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /items/:id/items  (replace all component items)
itemBuilderRouter.put('/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    await query('DELETE FROM item_builder_items WHERE item_builder_id=$1', [req.params.id]);
    for (const item of (items || [])) {
      await query(
        `INSERT INTO item_builder_items (item_builder_id,recipe_id,ingredient_id,item_name,quantity,unit,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.params.id, item.recipe_id||null, item.ingredient_id||null,
         item.item_name||null, item.quantity||1, item.unit||null, item.sort_order||0]
      );
    }
    const { rows } = await query(
      `SELECT ibi.*, r.recipe_name, r.serving_size,
         ii.item_name as ingredient_name, ii.cost_per_gram
       FROM item_builder_items ibi
       LEFT JOIN recipes r ON ibi.recipe_id = r.id
       LEFT JOIN ingredient_items ii ON ibi.ingredient_id = ii.id
       WHERE ibi.item_builder_id=$1 ORDER BY ibi.sort_order`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /items/:id/variants  (replace all variants)
itemBuilderRouter.put('/:id/variants', async (req, res) => {
  try {
    const { variants } = req.body;
    await query('DELETE FROM item_variants WHERE item_builder_id=$1', [req.params.id]);
    for (const v of (variants || [])) {
      await query(
        `INSERT INTO item_variants (item_builder_id, variant_name, price_override, square_id, sort_order, is_active)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, v.variant_name, v.price_override || null, v.square_id || null, v.sort_order || 0, v.is_active !== false]
      );
    }
    const { rows } = await query(
      'SELECT * FROM item_variants WHERE item_builder_id=$1 ORDER BY sort_order',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

itemBuilderRouter.patch('/:id/favorite', async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE item_builder SET is_favorite=$1 WHERE id=$2 RETURNING id, is_favorite',
      [req.body.is_favorite, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /items/:id/freezer — adjust freezer stock by delta, or set absolute qty
itemBuilderRouter.patch('/:id/freezer', async (req, res) => {
  try {
    const { delta, qty } = req.body;
    let sql, params;
    if (qty !== undefined) {
      sql = 'UPDATE item_builder SET freezer_qty=$1 WHERE id=$2 RETURNING id, freezer_qty';
      params = [Math.max(0, parseInt(qty) || 0), req.params.id];
    } else {
      sql = 'UPDATE item_builder SET freezer_qty=GREATEST(0, freezer_qty+$1) WHERE id=$2 RETURNING id, freezer_qty';
      params = [parseInt(delta) || 0, req.params.id];
    }
    const { rows } = await query(sql, params);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

itemBuilderRouter.delete('/:id', async (req, res) => {
  try {
    await query('UPDATE item_builder SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Event Menus ──────────────────────────────────────────
import { Router as EmRouter } from 'express';
export const eventMenusRouter = EmRouter();
eventMenusRouter.use(requireAuth);

// GET /event-menus — list all menus with event name + item count
eventMenusRouter.get('/', async (req, res) => {
  try {
    const { event_id } = req.query;
    const where = event_id ? 'WHERE em.event_id=$1' : '';
    const params = event_id ? [event_id] : [];
    const { rows } = await query(
      `SELECT em.*, e.event_name,
         COUNT(emi.id)::int as item_count
       FROM event_menus em
       LEFT JOIN events e ON em.event_id = e.id
       LEFT JOIN event_menu_items emi ON emi.menu_id = em.id
       ${where} GROUP BY em.id, e.event_name ORDER BY em.created_at DESC`, params
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /event-menus error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /event-menus/:id — menu + items joined with item_builder
eventMenusRouter.get('/:id', async (req, res) => {
  const [menu, items] = await Promise.all([
    query(`SELECT em.*, e.event_name FROM event_menus em
           LEFT JOIN events e ON em.event_id=e.id WHERE em.id=$1`, [req.params.id]),
    query(`SELECT emi.*,
             ib.item_name, ib.description, ib.retail_price, ib.image_url
           FROM event_menu_items emi
           LEFT JOIN item_builder ib ON emi.item_builder_id=ib.id
           WHERE emi.menu_id=$1 ORDER BY emi.sort_order, ib.item_name`, [req.params.id]),
  ]);
  if (!menu.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...menu.rows[0], items: items.rows });
});

eventMenusRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO event_menus (event_id,menu_name,tagline,tagline_color,is_active)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [f.event_id||null, f.menu_name, f.tagline||null, f.tagline_color||'#e85d26', f.is_active !== false]
  );
  res.status(201).json(rows[0]);
});

eventMenusRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE event_menus SET event_id=$1,menu_name=$2,tagline=$3,tagline_color=$4,is_active=$5
     WHERE id=$6 RETURNING *`,
    [f.event_id||null, f.menu_name, f.tagline||null, f.tagline_color||'#e85d26', f.is_active !== false, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

eventMenusRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM event_menus WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Menu items
eventMenusRouter.post('/:id/items', async (req, res) => {
  const f = req.body;
  const { rows: [{ max }] } = await query(
    'SELECT COALESCE(MAX(sort_order),0) as max FROM event_menu_items WHERE menu_id=$1',
    [req.params.id]
  );
  const { rows } = await query(
    `INSERT INTO event_menu_items (menu_id,item_builder_id,sort_order,qty_on_hand,limited_threshold)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, f.item_builder_id, parseInt(max)+1, f.qty_on_hand ?? 0, f.limited_threshold ?? 3]
  );
  res.status(201).json(rows[0]);
});

eventMenusRouter.put('/:id/items/:itemId', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE event_menu_items SET qty_on_hand=$1,limited_threshold=$2,sort_order=$3,is_special=$4
     WHERE id=$5 AND menu_id=$6 RETURNING *`,
    [f.qty_on_hand, f.limited_threshold, f.sort_order, f.is_special ?? false, req.params.itemId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

eventMenusRouter.delete('/:id/items/:itemId', async (req, res) => {
  await query('DELETE FROM event_menu_items WHERE id=$1 AND menu_id=$2',
    [req.params.itemId, req.params.id]);
  res.json({ ok: true });
});

// ── Donations ────────────────────────────────────────────
import { Router as DoRouter } from 'express';
export const donationsRouter = DoRouter();
donationsRouter.use(requireAuth);

// Must be before /:id
donationsRouter.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await query(
      `SELECT d.donated_at, e.event_name, ib.item_name, d.quantity, d.unit_value,
              (d.quantity * d.unit_value) AS total_value, d.notes
       FROM donations d
       LEFT JOIN events e ON d.event_id = e.id
       LEFT JOIN item_builder ib ON d.item_builder_id = ib.id
       WHERE ($1::date IS NULL OR d.donated_at >= $1::date)
         AND ($2::date IS NULL OR d.donated_at <= $2::date)
       ORDER BY d.donated_at DESC`,
      [from || null, to || null]
    );
    const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const lines = [
      'Date,Event,Item,Qty,Unit Value,Total Value,Notes',
      ...rows.map(r => [
        r.donated_at ? new Date(r.donated_at).toISOString().split('T')[0] : '',
        esc(r.event_name),
        esc(r.item_name),
        r.quantity,
        r.unit_value,
        r.total_value,
        esc(r.notes),
      ].join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="donations.csv"');
    res.send(lines.join('\n'));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

donationsRouter.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.*, e.event_name, ib.item_name, ib.retail_price,
              (d.quantity * d.unit_value) AS total_value
       FROM donations d
       LEFT JOIN events e ON d.event_id = e.id
       LEFT JOIN item_builder ib ON d.item_builder_id = ib.id
       ORDER BY d.donated_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

donationsRouter.post('/', async (req, res) => {
  try {
    const { event_id, item_builder_id, quantity, unit_value, donated_at, notes } = req.body;
    const { rows } = await query(
      `INSERT INTO donations (event_id, item_builder_id, quantity, unit_value, donated_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [event_id || null, item_builder_id, quantity, unit_value, donated_at || new Date(), notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

donationsRouter.put('/:id', async (req, res) => {
  try {
    const { event_id, item_builder_id, quantity, unit_value, donated_at, notes } = req.body;
    const { rows } = await query(
      `UPDATE donations SET event_id=$1, item_builder_id=$2, quantity=$3, unit_value=$4,
              donated_at=$5, notes=$6, updated_at=now()
       WHERE id=$7 RETURNING *`,
      [event_id || null, item_builder_id, quantity, unit_value, donated_at, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

donationsRouter.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM donations WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Vendors ──────────────────────────────────────────────
import { Router as VenRouter } from 'express';
export const vendorsRouter = VenRouter();
vendorsRouter.use(requireAuth);

vendorsRouter.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM event_vendors ORDER BY vendor_name');
  res.json(rows);
});
vendorsRouter.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM event_vendors WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
vendorsRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO event_vendors (vendor_name,address,city,state,zip,logo_url,map_embed,website_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [f.vendor_name,f.address,f.city,f.state,f.zip,f.logo_url,f.map_embed,f.website_url]
  );
  res.status(201).json(rows[0]);
});
vendorsRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE event_vendors SET vendor_name=$1,address=$2,city=$3,state=$4,
      zip=$5,logo_url=$6,map_embed=$7,website_url=$8
     WHERE id=$9 RETURNING *`,
    [f.vendor_name,f.address,f.city,f.state,f.zip,f.logo_url,f.map_embed,f.website_url,req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
vendorsRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM event_vendors WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});