import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/baking-plan', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return res.status(400).json({ error: 'start and end required (YYYY-MM-DD)' });
    }

    // Events in range
    const { rows: events } = await query(
      `SELECT id, event_name, event_date FROM events WHERE event_date BETWEEN $1 AND $2 ORDER BY event_date`,
      [start, end]
    );

    // Aggregate qty_initial per item across all menus in range
    const { rows: itemRows } = await query(
      `SELECT
         ib.id,
         ib.item_name,
         COALESCE(ib.batch_qty, 1)     AS batch_qty,
         COALESCE(ib.freezer_qty, 0)   AS freezer_qty,
         SUM(emi.qty_initial)::int     AS total_qty_needed
       FROM event_menu_items emi
       JOIN event_menus em ON emi.menu_id = em.id
       JOIN events e       ON em.event_id = e.id
       JOIN item_builder ib ON emi.item_builder_id = ib.id
       WHERE e.event_date BETWEEN $1 AND $2
         AND e.status != 'cancelled'
         AND emi.item_builder_id IS NOT NULL
       GROUP BY ib.id, ib.item_name, ib.batch_qty, ib.freezer_qty`,
      [start, end]
    );

    // Compute deficit and batches needed
    const bakingPlan = itemRows.map(row => {
      const deficit = Math.max(0, row.total_qty_needed - row.freezer_qty);
      const batches_needed = row.batch_qty > 0 ? Math.ceil(deficit / row.batch_qty) : 0;
      return { ...row, deficit, batches_needed };
    }).filter(r => r.batches_needed > 0);

    if (bakingPlan.length === 0) {
      return res.json({ events, baking_plan: [], shopping_list: [] });
    }

    const itemIds = bakingPlan.map(r => r.id);

    // Get item components
    const { rows: components } = await query(
      `SELECT * FROM item_builder_items WHERE item_builder_id = ANY($1::uuid[])`,
      [itemIds]
    );

    const recipeIds = [...new Set(components.filter(c => c.recipe_id).map(c => c.recipe_id))];
    const directIngIds = [...new Set(
      components.filter(c => c.ingredient_id && !c.recipe_id).map(c => c.ingredient_id)
    )];

    // Get recipe ingredients (grams only)
    let recipeIngredients = [];
    if (recipeIds.length > 0) {
      const { rows } = await query(
        `SELECT * FROM recipe_ingredients
         WHERE recipe_id = ANY($1::uuid[]) AND measurement = 'g' AND ingredient_id IS NOT NULL`,
        [recipeIds]
      );
      recipeIngredients = rows;
    }

    // Collect all ingredient ids
    const recipeIngIds = recipeIngredients.map(r => r.ingredient_id);
    const allIngIds = [...new Set([...directIngIds, ...recipeIngIds])];

    // Fetch ingredient details
    const ingredientMap = {};
    if (allIngIds.length > 0) {
      const { rows: ings } = await query(
        `SELECT id, item_name, grams, current_price, unit_label
         FROM ingredient_items WHERE id = ANY($1::uuid[])`,
        [allIngIds]
      );
      ings.forEach(i => { ingredientMap[i.id] = i; });
    }

    // Build lookup maps
    const componentsByItem = {};
    components.forEach(c => {
      (componentsByItem[c.item_builder_id] ??= []).push(c);
    });
    const recipeIngByRecipe = {};
    recipeIngredients.forEach(ri => {
      (recipeIngByRecipe[ri.recipe_id] ??= []).push(ri);
    });

    // Aggregate grams per ingredient
    const totalGrams = {};
    for (const item of bakingPlan) {
      for (const comp of (componentsByItem[item.id] || [])) {
        if (comp.recipe_id) {
          for (const ri of (recipeIngByRecipe[comp.recipe_id] || [])) {
            const g = parseFloat(ri.amount) * parseFloat(comp.quantity) * item.batches_needed;
            totalGrams[ri.ingredient_id] = (totalGrams[ri.ingredient_id] || 0) + g;
          }
        } else if (comp.ingredient_id && comp.unit === 'g') {
          const g = parseFloat(comp.quantity) * item.batches_needed;
          totalGrams[comp.ingredient_id] = (totalGrams[comp.ingredient_id] || 0) + g;
        }
      }
    }

    // Build shopping list
    const shoppingList = Object.entries(totalGrams).map(([ingId, totalG]) => {
      const ing = ingredientMap[ingId];
      if (!ing) return null;
      const gramsPerUnit = parseFloat(ing.grams) || 0;
      const units_needed = gramsPerUnit > 0 ? Math.ceil(totalG / gramsPerUnit) : null;
      const estimated_cost = units_needed != null && ing.current_price
        ? (units_needed * parseFloat(ing.current_price)).toFixed(2)
        : null;
      return {
        ingredient_id: ingId,
        ingredient_name: ing.item_name,
        total_grams: Math.round(totalG),
        grams_per_unit: gramsPerUnit,
        unit_label: ing.unit_label,
        units_needed,
        estimated_cost,
      };
    }).filter(Boolean).sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

    res.json({ events, baking_plan: bakingPlan, shopping_list: shoppingList });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
