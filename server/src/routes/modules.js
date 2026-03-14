// ── Ingredients ──────────────────────────────────────────
import { Router as IngRouter } from 'express';
import pool, { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

export const ingredientsRouter = IngRouter();
ingredientsRouter.use(requireAuth);

ingredientsRouter.get('/', async (req, res) => {
  const { rows } = await query('SELECT * FROM ingredient_items ORDER BY item_name');
  res.json(rows);
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
  await query('DELETE FROM ingredient_items WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── Item Builder ─────────────────────────────────────────
import { Router as IbRouter } from 'express';
export const itemBuilderRouter = IbRouter();
itemBuilderRouter.use(requireAuth);

itemBuilderRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ib.* FROM item_builder ib ORDER BY ib.item_name`
  );
  res.json(rows);
});

// POST /items/import
itemBuilderRouter.post('/import', async (req, res) => {
  const { items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
  const [item, items] = await Promise.all([
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
  ]);
  if (!item.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...item.rows[0], items: items.rows });
});

itemBuilderRouter.post('/', async (req, res) => {
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
     f.image_url,f.square_id,f.woo_id]
  );
  res.status(201).json(rows[0]);
});

itemBuilderRouter.put('/:id', async (req, res) => {
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
     f.image_url,f.square_id,f.woo_id,req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// PUT /items/:id/items  (replace all component items)
itemBuilderRouter.put('/:id/items', async (req, res) => {
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
});

itemBuilderRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM item_builder WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
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
    `UPDATE event_menu_items SET qty_on_hand=$1,limited_threshold=$2,sort_order=$3
     WHERE id=$4 AND menu_id=$5 RETURNING *`,
    [f.qty_on_hand, f.limited_threshold, f.sort_order, req.params.itemId, req.params.id]
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

donationsRouter.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, e.event_name FROM donations d
     LEFT JOIN events e ON d.event_id=e.id ORDER BY d.donated_at DESC`
  );
  res.json(rows);
});
donationsRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO donations (event_id,donor_name,amount,donated_at,notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [f.event_id||null,f.donor_name,f.amount,f.donated_at||new Date(),f.notes]
  );
  res.status(201).json(rows[0]);
});
donationsRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE donations SET event_id=$1,donor_name=$2,amount=$3,donated_at=$4,notes=$5
     WHERE id=$6 RETURNING *`,
    [f.event_id||null,f.donor_name,f.amount,f.donated_at,f.notes,req.params.id]
  );
  res.json(rows[0]);
});
donationsRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM donations WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
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