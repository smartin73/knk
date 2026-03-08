import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

// ── Helpers ───────────────────────────────────────────────
const EMPTY_FORM = {
  recipe_name: '',
  recipe_type: '',
  description: '',
  serving_size: '',
  prep_time: '',
  cook_time: '',
  folds_required: 0,
  image_url: '',
  ingredient_label: '',
  contains_label: '',
  square_id: '',
  woo_id: '',
  notes: '',
  is_active: true,
};

const EMPTY_ING  = { ingredient_id: '', ingredient: '', amount: '', measurement: '' };
const EMPTY_STEP = { step_number: 1, step_description: '', step_time: '', requires_notification: false };

const MEASUREMENTS = ['g', 'kg', 'ml', 'L', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pinch', 'piece', 'slice', 'clove', 'sprig', 'bunch'];

function fmtCurrency(n) {
  if (!n && n !== 0) return '—';
  return `$${parseFloat(n).toFixed(4)}`;
}

function calcCost(ingredients) {
  let total = 0; let complete = true;
  for (const ing of ingredients) {
    if (!ing.cost_per_gram || !ing.amount || ing.measurement !== 'g') { complete = false; continue; }
    total += parseFloat(ing.cost_per_gram) * parseFloat(ing.amount);
  }
  return { total, complete };
}

// ── Quick Add Ingredient Modal ────────────────────────────
function QuickAddIngredient({ onSave, onCancel }) {
  const [form, setForm] = useState({ item_name: '', purchase_from: '', grams: '', current_price: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.item_name.trim()) return setErr('Item name is required.');
    setSaving(true); setErr('');
    try {
      const saved = await api.post('/ingredients', form);
      onSave(saved);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 300 }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Quick Add Ingredient</div>
        <div className="form-grid">
          <div className="field full">
            <label>Item Name</label>
            <input autoFocus value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. Bread Flour" />
          </div>
          <div className="field full">
            <label>Purchase From</label>
            <input value={form.purchase_from} onChange={e => set('purchase_from', e.target.value)} placeholder="e.g. Restaurant Depot" />
          </div>
          <div className="field">
            <label>Package Size (g)</label>
            <input type="number" value={form.grams} onChange={e => set('grams', e.target.value)} placeholder="e.g. 2267" />
          </div>
          <div className="field">
            <label>Current Price ($)</label>
            <input type="number" step="0.01" value={form.current_price} onChange={e => set('current_price', e.target.value)} placeholder="0.00" />
          </div>
        </div>
        {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Add Ingredient'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recipe Form ───────────────────────────────────────────
function RecipeForm({ initial, allIngredients: initialAllIngredients, onSave, onCancel }) {
  const [form, setForm]           = useState({ ...EMPTY_FORM, ...initial });
  const [ingredients, setIngredients] = useState(initial?.ingredients || []);
  const [steps, setSteps]         = useState(initial?.steps || []);
  const [allIngredients, setAllIngredients] = useState(initialAllIngredients || []);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
  const [quickAdd, setQuickAdd]   = useState(false); // index of ing row requesting quick add
  const [tab, setTab]             = useState('details'); // 'details' | 'ingredients' | 'steps'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Ingredients helpers
  function addIngredient() {
    setIngredients(ings => [...ings, { ...EMPTY_ING, sort_order: ings.length }]);
  }
  function setIng(idx, k, v) {
    setIngredients(ings => ings.map((ing, i) => {
      if (i !== idx) return ing;
      const updated = { ...ing, [k]: v };
      if (k === 'ingredient_id') {
        const found = allIngredients.find(a => a.id === v);
        if (found) updated.ingredient = found.item_name;
        updated.cost_per_gram = found?.cost_per_gram || null;
      }
      return updated;
    }));
  }
  function removeIng(idx) {
    setIngredients(ings => ings.filter((_, i) => i !== idx).map((ing, i) => ({ ...ing, sort_order: i })));
  }
  function moveIng(idx, dir) {
    setIngredients(ings => {
      const next = [...ings];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return ings;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((ing, i) => ({ ...ing, sort_order: i }));
    });
  }

  // Steps helpers
  function addStep() {
    setSteps(ss => [...ss, { ...EMPTY_STEP, step_number: ss.length + 1 }]);
  }
  function setStep(idx, k, v) {
    setSteps(ss => ss.map((s, i) => i === idx ? { ...s, [k]: v } : s));
  }
  function removeStep(idx) {
    setSteps(ss => ss.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  }
  function moveStep(idx, dir) {
    setSteps(ss => {
      const next = [...ss];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return ss;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
  }

  async function handleSubmit() {
    if (!form.recipe_name.trim()) { setTab('details'); return setErr('Recipe name is required.'); }
    const badIng = ingredients.find(i => !i.ingredient_id);
    if (badIng) { setTab('ingredients'); return setErr('All ingredient rows must have an ingredient selected.'); }
    setErr(''); setSaving(true);
    try {
      await onSave(form, ingredients, steps);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleQuickAdded(newIng, idx) {
    setAllIngredients(all => [...all, newIng]);
    setIng(idx, 'ingredient_id', newIng.id);
    setQuickAdd(false);
  }

  const { total: costTotal } = calcCost(ingredients);

  const tabStyle = (t) => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderBottom: tab === t ? '2px solid var(--accent2)' : '2px solid transparent',
    background: 'none', color: tab === t ? 'var(--accent2)' : 'var(--text-muted)',
  });

  return (
    <>
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 740, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">{initial?.id ? 'Edit Recipe' : 'New Recipe'}</div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 4 }}>
          <button style={tabStyle('details')} onClick={() => setTab('details')}>Details</button>
          <button style={tabStyle('ingredients')} onClick={() => setTab('ingredients')}>
            Ingredients {ingredients.length > 0 && `(${ingredients.length})`}
          </button>
          <button style={tabStyle('steps')} onClick={() => setTab('steps')}>
            Steps {steps.length > 0 && `(${steps.length})`}
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>

          {/* ── Details Tab ── */}
          {tab === 'details' && (
            <div className="form-grid">
              <div className="field full">
                <label>Recipe Name</label>
                <input value={form.recipe_name} onChange={e => set('recipe_name', e.target.value)} placeholder="e.g. Sourdough Boule" />
              </div>
              <div className="field">
                <label>Type</label>
                <input value={form.recipe_type || ''} onChange={e => set('recipe_type', e.target.value)} placeholder="e.g. Bread, Pastry, Cookie" />
              </div>
              <div className="field">
                <label>Serving Size</label>
                <input type="number" value={form.serving_size || ''} onChange={e => set('serving_size', e.target.value)} placeholder="e.g. 12" />
              </div>
              <div className="field">
                <label>Prep Time</label>
                <input value={form.prep_time || ''} onChange={e => set('prep_time', e.target.value)} placeholder="e.g. 30 min" />
              </div>
              <div className="field">
                <label>Cook Time</label>
                <input value={form.cook_time || ''} onChange={e => set('cook_time', e.target.value)} placeholder="e.g. 45 min" />
              </div>
              <div className="field">
                <label>Folds Required</label>
                <input type="number" value={form.folds_required ?? 0} onChange={e => set('folds_required', e.target.value)} />
              </div>
              <div className="field full">
                <label>Description</label>
                <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Brief description..." />
              </div>
              <div className="field full">
                <label>Notes</label>
                <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Internal notes..." />
              </div>
              <div className="field">
                <label>Ingredient Label</label>
                <input value={form.ingredient_label || ''} onChange={e => set('ingredient_label', e.target.value)} placeholder="For packaging..." />
              </div>
              <div className="field">
                <label>Contains Label</label>
                <input value={form.contains_label || ''} onChange={e => set('contains_label', e.target.value)} placeholder="e.g. Wheat, Eggs, Dairy" />
              </div>
              <div className="field">
                <label>Image URL</label>
                <input value={form.image_url || ''} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="field">
                <label>Square ID</label>
                <input value={form.square_id || ''} onChange={e => set('square_id', e.target.value)} />
              </div>
              <div className="field full" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" id="is_active" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked)} style={{ width: 'auto' }} />
                <label htmlFor="is_active" style={{ textTransform: 'none', fontSize: 13, color: 'var(--text)' }}>Active</label>
              </div>
            </div>
          )}

          {/* ── Ingredients Tab ── */}
          {tab === 'ingredients' && (
            <div>
              {ingredients.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>No ingredients yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>Ingredient</th>
                      <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>Amount</th>
                      <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>Unit</th>
                      <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>Cost</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing, idx) => {
                      const ingCost = ing.cost_per_gram && ing.amount && ing.measurement === 'g'
                        ? parseFloat(ing.cost_per_gram) * parseFloat(ing.amount)
                        : null;
                      return (
                        <tr key={idx}>
                          <td style={{ padding: '4px 8px 4px 0', minWidth: 180 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select
                                value={ing.ingredient_id || ''}
                                onChange={e => setIng(idx, 'ingredient_id', e.target.value)}
                                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
                              >
                                <option value="">— Select —</option>
                                {allIngredients.map(a => <option key={a.id} value={a.id}>{a.item_name}</option>)}
                              </select>
                              <button
                                title="Quick add ingredient"
                                onClick={() => setQuickAdd(idx)}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 7px', cursor: 'pointer', color: 'var(--accent2)', fontSize: 13, lineHeight: 1 }}
                              >+</button>
                            </div>
                          </td>
                          <td style={{ padding: '4px 8px 4px 0', width: 80 }}>
                            <input
                              type="number" step="0.0001"
                              value={ing.amount || ''}
                              onChange={e => setIng(idx, 'amount', e.target.value)}
                              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '4px 8px 4px 0', width: 90 }}>
                            <select
                              value={ing.measurement || ''}
                              onChange={e => setIng(idx, 'measurement', e.target.value)}
                              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
                            >
                              <option value="">—</option>
                              {MEASUREMENTS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '4px 8px 4px 0', width: 80, fontSize: 12, color: ingCost ? 'var(--text)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {ingCost ? `$${ingCost.toFixed(4)}` : '—'}
                          </td>
                          <td style={{ padding: '4px 0', whiteSpace: 'nowrap' }}>
                            <button onClick={() => moveIng(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↑</button>
                            <button onClick={() => moveIng(idx, 1)} disabled={idx === ingredients.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↓</button>
                            <button onClick={() => removeIng(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red, #e55)', padding: '2px 4px' }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button className="btn btn-secondary btn-sm" onClick={addIngredient}>+ Add Ingredient</button>
                {ingredients.length > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Ingredient cost: <strong style={{ color: 'var(--text)' }}>${costTotal.toFixed(4)}</strong>
                    <span style={{ fontSize: 11, marginLeft: 6 }}>(grams only)</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Steps Tab ── */}
          {tab === 'steps' && (
            <div>
              {steps.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>No steps yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {steps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-muted)', minWidth: 24, paddingTop: 6 }}>{step.step_number}.</div>
                      <div style={{ flex: 1 }}>
                        <textarea
                          value={step.step_description}
                          onChange={e => setStep(idx, 'step_description', e.target.value)}
                          placeholder="Describe this step..."
                          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 60, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center' }}>
                          <input
                            placeholder="Time (e.g. 30 min)"
                            value={step.step_time || ''}
                            onChange={e => setStep(idx, 'step_time', e.target.value)}
                            style={{ width: 130, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!step.requires_notification} onChange={e => setStep(idx, 'requires_notification', e.target.checked)} style={{ width: 'auto' }} />
                            Notify
                          </label>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => moveStep(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↑</button>
                        <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↓</button>
                        <button onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red, #e55)', padding: '2px 4px' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-secondary btn-sm" onClick={addStep}>+ Add Step</button>
            </div>
          )}
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Recipe'}
          </button>
        </div>
      </div>
    </div>

    {quickAdd !== false && (
      <QuickAddIngredient
        onSave={(newIng) => handleQuickAdded(newIng, quickAdd)}
        onCancel={() => setQuickAdd(false)}
      />
    )}
    </>
  );
}

// ── Detail Modal ──────────────────────────────────────────
function RecipeDetail({ recipe: initialRecipe, onEdit, onClose }) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/recipes/${initialRecipe.id}`)
      .then(data => setRecipe(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [initialRecipe.id]);

  function handlePrint() {
    const w = window.open('', '_blank');
    const ings = (recipe.ingredients || []).map(i =>
      `<tr><td>${i.ingredient}</td><td>${i.amount || ''} ${i.measurement || ''}</td></tr>`
    ).join('');
    const steps = (recipe.steps || []).map(s =>
      `<li style="margin-bottom:8px">${s.step_description}${s.step_time ? ` <em>(${s.step_time})</em>` : ''}</li>`
    ).join('');
    w.document.write(`
      <html><head><title>${recipe.recipe_name}</title>
      <style>body{font-family:sans-serif;max-width:680px;margin:40px auto;color:#111}
      h1{font-size:24px;margin-bottom:4px}
      .meta{color:#666;font-size:13px;margin-bottom:20px}
      h2{font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#444;margin:24px 0 10px}
      table{width:100%;border-collapse:collapse}
      td,th{padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:left}
      th{font-weight:600;color:#666}
      ol{padding-left:20px;font-size:13px;line-height:1.7}
      </style></head><body>
      <h1>${recipe.recipe_name}</h1>
      <div class="meta">
        ${recipe.recipe_type ? `Type: ${recipe.recipe_type} &nbsp;|&nbsp; ` : ''}
        ${recipe.serving_size ? `Serves: ${recipe.serving_size} &nbsp;|&nbsp; ` : ''}
        ${recipe.prep_time ? `Prep: ${recipe.prep_time} &nbsp;|&nbsp; ` : ''}
        ${recipe.cook_time ? `Cook: ${recipe.cook_time}` : ''}
      </div>
      ${recipe.description ? `<p style="font-size:13px;color:#444">${recipe.description}</p>` : ''}
      ${ings ? `<h2>Ingredients</h2><table><thead><tr><th>Ingredient</th><th>Amount</th></tr></thead><tbody>${ings}</tbody></table>` : ''}
      ${steps ? `<h2>Steps</h2><ol>${steps}</ol>` : ''}
      ${recipe.notes ? `<h2>Notes</h2><p style="font-size:13px">${recipe.notes}</p>` : ''}
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  const { total: costTotal } = calcCost(recipe.ingredients || []);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.recipe_name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                  {[recipe.recipe_type, recipe.serving_size ? `Serves ${recipe.serving_size}` : null,
                    recipe.prep_time ? `Prep ${recipe.prep_time}` : null,
                    recipe.cook_time ? `Cook ${recipe.cook_time}` : null]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: recipe.is_active ? 'var(--green-bg, #1a3a1a)' : 'var(--surface2)', color: recipe.is_active ? 'var(--green, #4caf50)' : 'var(--text-muted)', fontWeight: 600 }}>
                {recipe.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {recipe.description && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>{recipe.description}</p>
              )}

              {recipe.ingredients?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                    Ingredients
                    {costTotal > 0 && <span style={{ marginLeft: 10, fontWeight: 400 }}>— est. cost <strong style={{ color: 'var(--text)' }}>${costTotal.toFixed(4)}</strong></span>}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {recipe.ingredients.map(i => (
                        <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px 6px 0', fontSize: 13 }}>{i.ingredient}</td>
                          <td style={{ padding: '6px 0', fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                            {i.amount ? `${i.amount} ${i.measurement || ''}`.trim() : '—'}
                          </td>
                          {i.cost_per_gram && i.amount && i.measurement === 'g' && (
                            <td style={{ padding: '6px 0 6px 12px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', textAlign: 'right' }}>
                              ${(parseFloat(i.cost_per_gram) * parseFloat(i.amount)).toFixed(4)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {recipe.steps?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Steps</div>
                  <ol style={{ paddingLeft: 20, margin: 0 }}>
                    {recipe.steps.map(s => (
                      <li key={s.id} style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>
                        {s.step_description}
                        {s.step_time && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — {s.step_time}</span>}
                        {s.requires_notification && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent2)' }}>⏰</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {(recipe.contains_label || recipe.ingredient_label) && (
                <div style={{ marginBottom: 16 }}>
                  {recipe.ingredient_label && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Ingredient Label</div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{recipe.ingredient_label}</div>
                    </div>
                  )}
                  {recipe.contains_label && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Contains</div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{recipe.contains_label}</div>
                    </div>
                  )}
                </div>
              )}

              {recipe.notes && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Notes</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{recipe.notes}</div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
              <button className="btn btn-primary" onClick={onEdit}>Edit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────
function DeleteConfirm({ recipe, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Delete Recipe</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{recipe.recipe_name}</strong>? This cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" disabled={deleting} onClick={async () => {
            setDeleting(true);
            await onConfirm();
          }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Recipes Page ──────────────────────────────────────────
export function RecipesPage() {
  const [recipes, setRecipes]         = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState('');
  const [modal, setModal]             = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)     params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      const [recs, ings] = await Promise.all([
        api.get(`/recipes?${params}`),
        api.get('/ingredients'),
      ]);
      setRecipes(recs);
      setAllIngredients(ings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const types = [...new Set(recipes.map(r => r.recipe_type).filter(Boolean))].sort();

  async function handleSave(form, ingredients, steps) {
    let saved;
    if (modal.recipe?.id) {
      saved = await api.put(`/recipes/${modal.recipe.id}`, form);
    } else {
      saved = await api.post('/recipes', form);
    }
    await Promise.all([
      api.put(`/recipes/${saved.id}/ingredients`, { ingredients }),
      api.put(`/recipes/${saved.id}/steps`, { steps }),
    ]);
    setModal(null);
    load();
  }

  async function handleDelete() {
    await api.delete(`/recipes/${modal.recipe.id}`);
    setModal(null);
    load();
  }

  async function handleDuplicate(recipe) {
    const full = await api.get(`/recipes/${recipe.id}`);
    setModal({
      mode: 'new',
      recipe: {
        ...full,
        id: undefined,
        recipe_name: `Copy of ${full.recipe_name}`,
        square_id: '',
        woo_id: '',
      },
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📖 Recipes</div>
          <div className="page-subtitle">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ New Recipe</button>
      </div>

      <div className="search-bar">
        <input
          style={{ flex: 1, maxWidth: 320, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          placeholder="Search recipes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {types.length > 0 && (
          <select
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : recipes.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>📖</div>
            <p>{search || typeFilter ? 'No recipes match your search.' : 'No recipes yet. Add your first recipe to get started.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Type</th>
                  <th>Serves</th>
                  <th>Prep</th>
                  <th>Cook</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recipes.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div
                        style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--accent2)' }}
                        onClick={() => setModal({ mode: 'detail', recipe: r })}
                      >
                        {r.recipe_name}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.recipe_type || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.serving_size || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.prep_time || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.cook_time || '—'}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: r.is_active ? 'var(--green-bg, #1a3a1a)' : 'var(--surface2)', color: r.is_active ? 'var(--green, #4caf50)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'edit', recipe: r })}>Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDuplicate(r)}>Dupe</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setModal({ mode: 'delete', recipe: r })}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'detail' && (
        <RecipeDetail
          recipe={modal.recipe}
          onEdit={() => setModal({ mode: 'edit', recipe: modal.recipe })}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.mode === 'new' || modal?.mode === 'edit') && (
        <RecipeForm
          initial={modal.recipe}
          allIngredients={allIngredients}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirm
          recipe={modal.recipe}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
