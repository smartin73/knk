import { Router } from 'express';
import pool, { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  if (h === 0 && min === 0) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function extractRecipeJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      const recipe = items.find(item => {
        const t = item['@type'];
        return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
      });
      if (recipe) return recipe;
    } catch { /* skip */ }
  }
  return null;
}

function mapSchemaRecipe(s) {
  const steps = [];
  let n = 1;
  for (const inst of (s.recipeInstructions || [])) {
    if (typeof inst === 'string') {
      steps.push({ step_number: n++, step_description: inst, step_type: 'regular', step_time: null, requires_notification: false });
    } else if (inst['@type'] === 'HowToStep') {
      steps.push({ step_number: n++, step_description: inst.text || inst.name || '', step_type: 'regular', step_time: null, requires_notification: false });
    } else if (inst['@type'] === 'HowToSection') {
      for (const sub of (inst.itemListElement || [])) {
        steps.push({ step_number: n++, step_description: sub.text || sub.name || '', step_type: 'regular', step_time: null, requires_notification: false });
      }
    }
  }
  const ingredients = (s.recipeIngredient || []).map((ing, i) => ({
    ingredient: ing, amount: null, measurement: null, sort_order: i,
  }));
  let servingSize = null;
  const y = s.recipeYield;
  if (y) {
    const first = Array.isArray(y) ? y[0] : y;
    const nm = String(first).match(/\d+/);
    if (nm) servingSize = parseInt(nm[0]);
  }
  return {
    recipe_name: s.name || 'Untitled Recipe',
    recipe_type: Array.isArray(s.recipeCategory) ? s.recipeCategory[0] : (s.recipeCategory || null),
    description: s.description || null,
    serving_size: servingSize,
    prep_time: parseDuration(s.prepTime),
    cook_time: parseDuration(s.cookTime),
    ingredient_label: null,
    contains_label: null,
    notes: null,
    steps,
    ingredients,
  };
}

function extractJSON(text) {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

const IMAGE_PROMPT = `Extract the recipe from this image and return ONLY a JSON object with this exact structure, no markdown, no explanation:
{
  "recipe_name": "string",
  "recipe_type": "string or null",
  "description": "string or null",
  "serving_size": number or null,
  "prep_time": "HH:MM string or null",
  "cook_time": "HH:MM string or null",
  "ingredient_label": "string or null",
  "contains_label": "string or null",
  "steps": [{ "step_number": 1, "step_description": "string", "step_time": "string or null", "step_type": "regular", "requires_notification": false }],
  "ingredients": [{ "ingredient": "name only", "amount": number or null, "measurement": "unit or null", "sort_order": 0 }]
}`;

const router = Router();
router.use(requireAuth);

// POST /recipes/import/from-url
router.post('/import/from-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch URL: ${pageRes.statusText}` });
    const html = await pageRes.text();
    const schema = extractRecipeJsonLd(html);
    if (!schema) return res.status(422).json({ error: 'No recipe data found on this page. The site may not support structured recipe data.' });
    const recipe = mapSchemaRecipe(schema);
    res.json({ recipe });
  } catch (e) {
    console.error('import/from-url error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /recipes/import/from-text
router.post('/import/from-text', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Recipe text required' });
  try {
    const { rows: keyRows } = await query(`SELECT value FROM settings WHERE key = 'gemini_api_key'`);
    const apiKey = keyRows[0]?.value;
    if (!apiKey) return res.status(400).json({ error: 'Gemini API key not set. Add it in Settings.' });
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([IMAGE_PROMPT + '\n\nRecipe text:\n' + text.trim()]);
    const recipe = extractJSON(result.response.text());
    recipe.steps = (recipe.steps || []).map((s, i) => ({ ...s, step_number: s.step_number ?? i + 1, step_type: s.step_type || 'regular', requires_notification: false }));
    recipe.ingredients = (recipe.ingredients || []).map((ing, i) => ({ ...ing, sort_order: ing.sort_order ?? i }));
    res.json({ recipe });
  } catch (e) {
    console.error('import/from-text error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /recipes/import/from-image
router.post('/import/from-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image required' });
  try {
    const { rows: keyRows } = await query(`SELECT value FROM settings WHERE key = 'gemini_api_key'`);
    const apiKey = keyRows[0]?.value;
    if (!apiKey) return res.status(400).json({ error: 'Gemini API key not set. Add it in Settings.' });
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent([
      IMAGE_PROMPT,
      { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString('base64') } },
    ]);
    const recipe = extractJSON(result.response.text());
    recipe.steps = (recipe.steps || []).map((s, i) => ({ ...s, step_number: s.step_number ?? i + 1, step_type: s.step_type || 'regular', requires_notification: false }));
    recipe.ingredients = (recipe.ingredients || []).map((ing, i) => ({ ...ing, sort_order: ing.sort_order ?? i }));
    res.json({ recipe });
  } catch (e) {
    console.error('import/from-image error:', e);
    res.status(500).json({ error: e.message });
  }
});

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
              step.step_description || '',
              step.step_time || null,
              step.requires_notification === 'Yes',
            ]
          );
        }
      }

      if (r.ingredients?.length) {
        // Build name→id map for matching
        const names = r.ingredients.map(i => i.ingredient).filter(Boolean);
        const { rows: ingItems } = await client.query(
          `SELECT id, item_name FROM ingredient_items WHERE item_name = ANY($1)`,
          [names]
        );
        const nameToId = Object.fromEntries(ingItems.map(i => [i.item_name.toLowerCase(), i.id]));

        for (const ing of r.ingredients) {
          const ingredientId = nameToId[ing.ingredient?.toLowerCase()] || null;
          await client.query(
            `INSERT INTO recipe_ingredients
              (recipe_id, ingredient_id, ingredient, amount, measurement, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [recipeId, ingredientId, ing.ingredient || null, ing.amount || null, ing.measurement || null, ing.sort_order || 0]
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

// GET /recipes/tests  — all tests across all recipes (must be before /:id)
router.get('/tests', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT rt.*, r.recipe_name
      FROM recipe_tests rt
      JOIN recipes r ON rt.recipe_id = r.id
      ORDER BY rt.tested_at DESC NULLS LAST, rt.id DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('GET /recipes/tests error:', e);
    res.status(500).json({ error: e.message });
  }
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

// ── Recipe Tests ──────────────────────────────────────────

// GET /recipes/:id/tests
router.get('/:id/tests', async (req, res) => {
  try {
    const { rows: tests } = await query(
      `SELECT * FROM recipe_tests WHERE recipe_id = $1 ORDER BY test_number DESC`,
      [req.params.id]
    );
    const testIds = tests.map(t => t.id);
    if (testIds.length === 0) return res.json([]);

    const [{ rows: steps }, { rows: ingredients }] = await Promise.all([
      query(`SELECT * FROM recipe_test_steps WHERE test_id = ANY($1) ORDER BY step_number`, [testIds]),
      query(
        `SELECT rts.*, ii.cost_per_gram FROM recipe_test_ingredients rts
         LEFT JOIN ingredient_items ii ON rts.ingredient_id = ii.id
         WHERE rts.test_id = ANY($1) ORDER BY sort_order`,
        [testIds]
      ),
    ]);

    const stepsByTest = {};
    const ingsByTest  = {};
    for (const s of steps)   { if (!stepsByTest[s.test_id]) stepsByTest[s.test_id] = []; stepsByTest[s.test_id].push(s); }
    for (const i of ingredients) { if (!ingsByTest[i.test_id]) ingsByTest[i.test_id] = []; ingsByTest[i.test_id].push(i); }

    res.json(tests.map(t => ({ ...t, steps: stepsByTest[t.id] || [], ingredients: ingsByTest[t.id] || [] })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /recipes/:id/tests  — snapshot current recipe state
router.post('/:id/tests', async (req, res) => {
  const { label, tested_at, stage } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // next test number for this recipe
    const { rows: [{ max }] } = await client.query(
      `SELECT COALESCE(MAX(test_number), 0) AS max FROM recipe_tests WHERE recipe_id = $1`,
      [req.params.id]
    );
    const testNumber = max + 1;

    const { rows: [test] } = await client.query(
      `INSERT INTO recipe_tests (recipe_id, test_number, label, stage, tested_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, testNumber, label || null, stage || 'testing', tested_at || new Date().toISOString().slice(0, 10)]
    );

    // snapshot current steps
    const { rows: srcSteps } = await client.query(
      `SELECT *, step_time::text as step_time FROM recipe_steps WHERE recipe_id = $1 ORDER BY step_number`,
      [req.params.id]
    );
    for (const s of srcSteps) {
      await client.query(
        `INSERT INTO recipe_test_steps (test_id, step_number, step_type, step_description, step_time, requires_notification, fold_type, fold_interval, temp_min, temp_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [test.id, s.step_number, s.step_type, s.step_description, s.step_time, s.requires_notification, s.fold_type, s.fold_interval, s.temp_min, s.temp_max]
      );
    }

    // snapshot current ingredients
    const { rows: srcIngs } = await client.query(
      `SELECT * FROM recipe_ingredients WHERE recipe_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );
    for (const i of srcIngs) {
      await client.query(
        `INSERT INTO recipe_test_ingredients (test_id, ingredient_id, ingredient, amount, measurement, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [test.id, i.ingredient_id, i.ingredient, i.amount, i.measurement, i.sort_order]
      );
    }

    await client.query('COMMIT');

    const [{ rows: steps }, { rows: ingredients }] = await Promise.all([
      query(`SELECT * FROM recipe_test_steps WHERE test_id = $1 ORDER BY step_number`, [test.id]),
      query(`SELECT rts.*, ii.cost_per_gram FROM recipe_test_ingredients rts LEFT JOIN ingredient_items ii ON rts.ingredient_id = ii.id WHERE rts.test_id = $1 ORDER BY sort_order`, [test.id]),
    ]);
    res.status(201).json({ ...test, steps, ingredients });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /recipes/:id/tests/:tid  — update header fields
router.put('/:id/tests/:tid', async (req, res) => {
  const { label, stage, tested_at, outcome, rating, tasting_notes, crumb_notes, crust_notes, observations } = req.body;
  try {
    const { rows: [test] } = await query(
      `UPDATE recipe_tests SET label=$1, stage=$2, tested_at=$3, outcome=$4, rating=$5,
        tasting_notes=$6, crumb_notes=$7, crust_notes=$8, observations=$9, updated_at=now()
       WHERE id=$10 AND recipe_id=$11 RETURNING *`,
      [label||null, stage||'testing', tested_at, outcome||'pending', rating||null,
       tasting_notes||null, crumb_notes||null, crust_notes||null, observations||null,
       req.params.tid, req.params.id]
    );
    if (!test) return res.status(404).json({ error: 'Not found' });
    res.json(test);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /recipes/:id/tests/:tid/steps
router.put('/:id/tests/:tid/steps', async (req, res) => {
  const { steps } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM recipe_test_steps WHERE test_id = $1`, [req.params.tid]);
    for (const s of (steps || [])) {
      await client.query(
        `INSERT INTO recipe_test_steps (test_id, step_number, step_type, step_description, step_time, requires_notification, fold_type, fold_interval, temp_min, temp_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.params.tid, s.step_number, s.step_type||'regular', s.step_description||'',
         s.step_time||null, s.requires_notification||false, s.fold_type||null,
         s.fold_interval||null, s.temp_min||null, s.temp_max||null]
      );
    }
    await client.query('COMMIT');
    const { rows } = await query(`SELECT * FROM recipe_test_steps WHERE test_id = $1 ORDER BY step_number`, [req.params.tid]);
    res.json(rows);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// PUT /recipes/:id/tests/:tid/ingredients
router.put('/:id/tests/:tid/ingredients', async (req, res) => {
  const { ingredients } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM recipe_test_ingredients WHERE test_id = $1`, [req.params.tid]);
    for (const i of (ingredients || [])) {
      await client.query(
        `INSERT INTO recipe_test_ingredients (test_id, ingredient_id, ingredient, amount, measurement, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.tid, i.ingredient_id||null, i.ingredient, i.amount||null, i.measurement, i.sort_order||0]
      );
    }
    await client.query('COMMIT');
    const { rows } = await query(
      `SELECT rts.*, ii.cost_per_gram FROM recipe_test_ingredients rts
       LEFT JOIN ingredient_items ii ON rts.ingredient_id = ii.id
       WHERE rts.test_id = $1 ORDER BY sort_order`,
      [req.params.tid]
    );
    res.json(rows);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /recipes/:id/tests/:tid/promote
router.post('/:id/tests/:tid/promote', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [test] } = await client.query(
      `SELECT * FROM recipe_tests WHERE id = $1 AND recipe_id = $2`,
      [req.params.tid, req.params.id]
    );
    if (!test) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Test not found' }); }

    // replace recipe steps with test steps
    await client.query(`DELETE FROM recipe_steps WHERE recipe_id = $1`, [req.params.id]);
    const { rows: testSteps } = await client.query(
      `SELECT * FROM recipe_test_steps WHERE test_id = $1 ORDER BY step_number`, [req.params.tid]
    );
    for (const s of testSteps) {
      await client.query(
        `INSERT INTO recipe_steps (recipe_id, step_number, step_type, step_description, step_time, requires_notification, fold_type, fold_interval, temp_min, temp_max)
         VALUES ($1,$2,$3,$4,$5::interval,$6,$7,$8,$9,$10)`,
        [req.params.id, s.step_number, s.step_type||'regular', s.step_description||'', s.step_time||null,
         s.requires_notification, s.fold_type, s.fold_interval, s.temp_min, s.temp_max]
      );
    }

    // replace recipe ingredients with test ingredients
    await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id = $1`, [req.params.id]);
    const { rows: testIngs } = await client.query(
      `SELECT * FROM recipe_test_ingredients WHERE test_id = $1 ORDER BY sort_order`, [req.params.tid]
    );
    for (const i of testIngs) {
      await client.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, ingredient, amount, measurement, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.params.id, i.ingredient_id, i.ingredient, i.amount, i.measurement, i.sort_order]
      );
    }

    // mark this test as promoted, clear is_promoted on others for this recipe
    await client.query(
      `UPDATE recipe_tests SET is_promoted = false WHERE recipe_id = $1`, [req.params.id]
    );
    await client.query(
      `UPDATE recipe_tests SET is_promoted = true, promoted_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.tid]
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

// DELETE /recipes/:id/tests/:tid
router.delete('/:id/tests/:tid', async (req, res) => {
  await query(`DELETE FROM recipe_tests WHERE id = $1 AND recipe_id = $2`, [req.params.tid, req.params.id]);
  res.json({ ok: true });
});

export default router;
