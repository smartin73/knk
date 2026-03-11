import { Router } from 'express';
import pool, { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// POST /recipes/import
router.post('/import', requireAuth, async (req, res) => {
  const { recipes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of recipes) {
      const { rows } = await client.query(
        `INSERT INTO recipes 
          (recipe_name, recipe_type, description, serving_size, prep_time, cook_time,
           ingredient_label, contains_label, square_id, woo_id, notes, is_active, recipe_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          r.recipe_name, r.recipe_type || null, r.description || null,
          r.serving_size || null, r.prep_time || null, r.cook_time || null,
          r.ingredient_label || null, r.contains_label || null,
          r.square_id || null, r.woo_id || null, r.notes || null,
          true, r.recipe_by || null,
        ]
      );
      const recipeId = rows[0].id;

      if (r.steps?.length) {
        for (const step of r.steps) {
          await client.query(
            `INSERT INTO recipe_steps
              (recipe_id, step_number, step_type, step_description, step_time, requires_notification)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              recipeId,
              step.step_number,
              step.step_type || 'regular',
              step.step_description || null,
              step.step_time || null,
              step.requires_notification === 'Yes',
            ]
          );
        }
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

// GET /recipes
router.get('/', async (req, res) => {
  const { search, type, active, stage } = req.query;
  const where = ['1=1']; const params = []; let i = 1;

  if (search) { where.push(`recipe_name ILIKE $${i++}`); params.push(`%${search}%`); }
  if (type)   { where.push(`recipe_type = $${i++}`); params.push(type); }
  if (active !== undefined) { where.push(`is_active = $${i++}`); params.push(active === 'true'); }
  if (stage)  { where.push(`stage = $${i++}`); params.push(stage); }
  const { rows } = await query(
    `SELECT * FROM recipes WHERE ${where.join(' AND ')} ORDER BY recipe_name`, params
  );
  res.json(rows);
});

// GET /recipes/:id  (with steps + ingredients)
router.get('/:id', async (req, res) => {
  try {
    const [recipe, steps, ingredients] = await Promise.all([
      query('SELECT * FROM recipes WHERE id = $1', [req.params.id]),
      query('SELECT *, step_time::text as step_time FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_number', [req.params.id]),
      query(`SELECT ri.*, ii.item_name as ingredient_item_name, ii.cost_per_gram
             FROM recipe_ingredients ri
             LEFT JOIN ingredient_items ii ON ri.ingredient_id = ii.id
             WHERE ri.recipe_id = $1 ORDER BY ri.sort_order`, [req.params.id]),
    ]);
    if (!recipe.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...recipe.rows[0], steps: steps.rows, ingredients: ingredients.rows });
  } catch (e) {
    console.error('GET /recipes/:id error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /recipes
router.post('/', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `INSERT INTO recipes (recipe_name,recipe_type,description,serving_size,
      prep_time,cook_time,image_url,ingredient_label,
      contains_label,square_id,woo_id,notes,stage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [f.recipe_name,f.recipe_type,f.description,f.serving_size,
     f.prep_time,f.cook_time,f.image_url,
     f.ingredient_label,f.contains_label,f.square_id,f.woo_id,f.notes,
     f.stage || 'production']
  );
  res.status(201).json(rows[0]);
});

// PUT /recipes/:id
router.put('/:id', async (req, res) => {
  const f = req.body;
  const { rows } = await query(
    `UPDATE recipes SET recipe_name=$1,recipe_type=$2,description=$3,
      serving_size=$4,prep_time=$5,cook_time=$6,
      image_url=$7,ingredient_label=$8,contains_label=$9,
      square_id=$10,woo_id=$11,notes=$12,is_active=$13,stage=$14
     WHERE id=$15 RETURNING *`,
    [f.recipe_name,f.recipe_type,f.description,f.serving_size,
     f.prep_time,f.cook_time,f.image_url,
     f.ingredient_label,f.contains_label,f.square_id,f.woo_id,
     f.notes,f.is_active,f.stage,req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// DELETE /recipes/:id
router.delete('/:id', async (req, res) => {
  await query('DELETE FROM recipes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// PUT /recipes/:id/steps  (replace all steps)
router.put('/:id/steps', async (req, res) => {
  const { steps } = req.body;
  await query('DELETE FROM recipe_steps WHERE recipe_id = $1', [req.params.id]);
  if (steps?.length) {
    for (const s of steps) {
      await query(
        `INSERT INTO recipe_steps (recipe_id,step_number,step_type,step_description,step_time,requires_notification,fold_type,fold_interval,temp_min,temp_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.id, s.step_number, s.step_type||'regular', s.step_description||'',
         s.step_time||null, s.requires_notification||false, s.fold_type||null,
         s.fold_interval||null, s.temp_min||null, s.temp_max||null]
      );
    }
  }
  res.json({ ok: true });
});

// PUT /recipes/:id/ingredients  (replace all ingredients)
router.put('/:id/ingredients', async (req, res) => {
  const { ingredients } = req.body;
  await query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [req.params.id]);
  for (const ing of (ingredients || [])) {
    await query(
      `INSERT INTO recipe_ingredients (recipe_id,ingredient_id,ingredient,amount,measurement,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, ing.ingredient_id||null, ing.ingredient, ing.amount||null, ing.measurement, ing.sort_order||0]
    );
  }
  const { rows } = await query(
    `SELECT ri.*, ii.item_name, ii.cost_per_gram FROM recipe_ingredients ri
     LEFT JOIN ingredient_items ii ON ri.ingredient_id = ii.id
     WHERE ri.recipe_id=$1 ORDER BY ri.sort_order`, [req.params.id]
  );
  res.json(rows);
});

export default router;