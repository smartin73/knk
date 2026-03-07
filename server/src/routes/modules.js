// ── Ingredients ──────────────────────────────────────────
import { Router as IngRouter } from 'express';
import { query } from '../db/pool.js';
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
    `SELECT ib.*, r.recipe_name FROM item_builder ib
     LEFT JOIN recipes r ON ib.recipe_id = r.id
     ORDER BY ib.item_name`
  );
  res.json(rows);
});
itemBuilderRouter.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT ib.*, r.recipe_name FROM item_builder ib
     LEFT JOIN recipes r ON ib.recipe_id = r.id WHERE ib.id=$1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});
itemBuilderRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO item_builder (recipe_id,item_name,description,batch_qty,retail_price,
      include_packaging,include_fees,food_cook_time,ingredient_label,contains_label,
      image_url,square_id,woo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [f.recipe_id,f.item_name,f.description,f.batch_qty||1,f.retail_price,
     f.include_packaging||false,f.include_fees||false,f.food_cook_time||null,
     f.ingredient_label,f.contains_label,f.image_url,f.square_id,f.woo_id]
  );
  res.status(201).json(rows[0]);
});
itemBuilderRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE item_builder SET recipe_id=$1,item_name=$2,description=$3,batch_qty=$4,
      retail_price=$5,include_packaging=$6,include_fees=$7,food_cook_time=$8,
      ingredient_label=$9,contains_label=$10,image_url=$11,square_id=$12,
      woo_id=$13,is_active=$14 WHERE id=$15 RETURNING *`,
    [f.recipe_id,f.item_name,f.description,f.batch_qty,f.retail_price,
     f.include_packaging,f.include_fees,f.food_cook_time||null,
     f.ingredient_label,f.contains_label,f.image_url,f.square_id,
     f.woo_id,f.is_active,req.params.id]
  );
  res.json(rows[0]);
});
itemBuilderRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM item_builder WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ── Event Menus ──────────────────────────────────────────
import { Router as EmRouter } from 'express';
export const eventMenusRouter = EmRouter();
eventMenusRouter.use(requireAuth);

eventMenusRouter.get('/', async (req, res) => {
  const { event_id } = req.query;
  const where = event_id ? 'WHERE em.event_id=$1' : '';
  const params = event_id ? [event_id] : [];
  const { rows } = await query(
    `SELECT em.*, e.event_name,
       COUNT(emi.id) as item_count,
       SUM(emi.qty_sold) as total_sold
     FROM event_menus em
     LEFT JOIN events e ON em.event_id = e.id
     LEFT JOIN event_menu_items emi ON emi.menu_id = em.id
     ${where} GROUP BY em.id, e.event_name ORDER BY em.event_date DESC`, params
  );
  res.json(rows);
});
eventMenusRouter.get('/:id', async (req, res) => {
  const [menu, items] = await Promise.all([
    query(`SELECT em.*, e.event_name FROM event_menus em
           LEFT JOIN events e ON em.event_id=e.id WHERE em.id=$1`, [req.params.id]),
    query(`SELECT emi.*, ib.item_name as catalog_name FROM event_menu_items emi
           LEFT JOIN item_builder ib ON emi.item_builder_id=ib.id
           WHERE emi.menu_id=$1 ORDER BY emi.item_name`, [req.params.id]),
  ]);
  if (!menu.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...menu.rows[0], items: items.rows });
});
eventMenusRouter.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO event_menus (event_id,event_date,start_time,end_time,gluten_free_avail,notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [f.event_id,f.event_date,f.start_time,f.end_time,f.gluten_free_avail||false,f.notes]
  );
  res.status(201).json(rows[0]);
});
eventMenusRouter.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE event_menus SET event_date=$1,start_time=$2,end_time=$3,
      gluten_free_avail=$4,notes=$5,is_processed=$6 WHERE id=$7 RETURNING *`,
    [f.event_date,f.start_time,f.end_time,f.gluten_free_avail,f.notes,f.is_processed,req.params.id]
  );
  res.json(rows[0]);
});
eventMenusRouter.delete('/:id', async (req, res) => {
  await query('DELETE FROM event_menus WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Menu items
eventMenusRouter.post('/:id/items', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO event_menu_items (menu_id,item_builder_id,item_name,item_description,
      price,qty_made,qty_sold,is_limited,is_sold_out,is_special,fee,packaging,image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.params.id,f.item_builder_id||null,f.item_name,f.item_description,
     f.price,f.qty_made||0,f.qty_sold||0,f.is_limited||false,
     f.is_sold_out||false,f.is_special||false,f.fee||0,f.packaging||0,f.image_url]
  );
  res.status(201).json(rows[0]);
});
eventMenusRouter.put('/:id/items/:itemId', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE event_menu_items SET item_name=$1,item_description=$2,price=$3,
      qty_made=$4,qty_sold=$5,is_limited=$6,is_sold_out=$7,is_special=$8,
      fee=$9,packaging=$10 WHERE id=$11 AND menu_id=$12 RETURNING *`,
    [f.item_name,f.item_description,f.price,f.qty_made,f.qty_sold,
     f.is_limited,f.is_sold_out,f.is_special,f.fee,f.packaging,
     req.params.itemId,req.params.id]
  );
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