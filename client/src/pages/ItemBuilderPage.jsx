import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { ItemBuilderImportModal } from './ItemBuilderImportModal.jsx';
import { RowMenu } from '../components/RowMenu.jsx';

// ── Helpers ───────────────────────────────────────────────
const EMPTY_FORM = {
  item_name: '',
  description: '',
  batch_qty: 1,
  retail_price: '',
  include_packaging: false,
  include_fees: false,
  packaging_cost: '',
  square_fee: '',
  square_fee_online: '',
  food_cook_time: '',
  ingredient_label: '',
  contains_label: '',
  image_url: '',
  square_id: '',
  woo_id: '',
};

const EMPTY_COMPONENT = {
  type: 'recipe',      // 'recipe' | 'ingredient'
  recipe_id: '',
  ingredient_id: '',
  item_name: '',
  quantity: '',
  unit: '',
  sort_order: 0,
};

const UNITS = ['g', 'kg', 'ml', 'L', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pinch', 'piece', 'slice', 'whole'];

function fmtPrice(n) {
  if (!n && n !== 0) return '—';
  return `$${parseFloat(n).toFixed(2)}`;
}

function calcItemCost(components) {
  let total = 0;
  for (const c of components) {
    if (c.type === 'recipe' || c.recipe_id) {
      if (c.recipe_cost_yield && c.quantity) {
        total += parseFloat(c.recipe_cost_yield) * parseFloat(c.quantity);
      }
    } else if (c.type === 'ingredient' || c.ingredient_id) {
      if (c.cost_per_gram && c.quantity && c.unit === 'g') {
        total += parseFloat(c.cost_per_gram) * parseFloat(c.quantity);
      }
    }
  }
  return total;
}

function calcFeeInPerson(retail, settings) {
  const rate = parseFloat(settings.square_fee_rate || 0.026);
  const flat = parseFloat(settings.square_fee_flat || 0.15);
  return Math.round(((retail * rate) + flat) * 100) / 100;
}

function calcFeeOnline(retail, settings) {
  const rate = parseFloat(settings.square_fee_online_rate || 0.033);
  const flat = parseFloat(settings.square_fee_online_flat || 0.30);
  return Math.round(((retail * rate) + flat) * 100) / 100;
}

// ── Component Row ─────────────────────────────────────────
function ComponentRow({ comp, idx, total, recipes, allIngredients, onChange, onRemove, onMove }) {
  const isRecipe = comp.type === 'recipe';

  return (
    <div style={{ background: 'var(--surface2)', border: `1px solid ${isRecipe ? 'var(--accent2)' : 'var(--border)'}`, borderRadius: 6, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['recipe', 'ingredient'].map(t => (
            <button
              key={t}
              onClick={() => onChange('type', t)}
              style={{
                padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: comp.type === t ? 'var(--accent2)' : 'var(--surface)',
                color: comp.type === t ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button onClick={() => onMove(-1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↑</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↓</button>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red, #e55)', padding: '2px 4px' }}>✕</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
            {isRecipe ? 'Recipe' : 'Ingredient'}
          </label>
          {isRecipe ? (
            <select
              value={comp.recipe_id || ''}
              onChange={e => onChange('recipe_id', e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
            >
              <option value="">— Select recipe —</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.recipe_name}</option>)}
            </select>
          ) : (
            <select
              value={comp.ingredient_id || ''}
              onChange={e => onChange('ingredient_id', e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
            >
              <option value="">— Select ingredient —</option>
              {allIngredients.map(i => <option key={i.id} value={i.id}>{i.item_name}</option>)}
            </select>
          )}
        </div>

        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Quantity</label>
          <input
            type="number" step="0.0001"
            value={comp.quantity || ''}
            onChange={e => onChange('quantity', e.target.value)}
            placeholder={isRecipe ? 'e.g. 0.5' : 'e.g. 50'}
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }}
          />
          {isRecipe && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>fraction of recipe (e.g. 0.5 = half)</div>}
        </div>

        {!isRecipe && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Unit</label>
            <select
              value={comp.unit || ''}
              onChange={e => onChange('unit', e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}
            >
              <option value="">—</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item Form ─────────────────────────────────────────────
function ItemForm({ initial, recipes, allIngredients, settings, onSave, onCancel }) {
  const [form, setForm]             = useState({ ...EMPTY_FORM, ...initial });
  const [components, setComponents] = useState(
    (initial?.items || []).map(i => ({ ...i, type: i.recipe_id ? 'recipe' : 'ingredient' }))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [tab, setTab]       = useState('details');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // When retail price changes, auto-recalculate fee fields from settings rates
  function handleRetailChange(val) {
    const updates = { retail_price: val };
    if (val) {
      const retail = parseFloat(val);
      if (!isNaN(retail)) {
        updates.square_fee        = calcFeeInPerson(retail, settings).toFixed(2);
        updates.square_fee_online = calcFeeOnline(retail, settings).toFixed(2);
      }
    }
    setForm(f => ({ ...f, ...updates }));
  }

  // When packaging checkbox turns on, auto-populate from settings if field is empty
  function handleIncludePackaging(checked) {
    const updates = { include_packaging: checked };
    if (checked && !form.packaging_cost && settings.packaging_cost) {
      updates.packaging_cost = parseFloat(settings.packaging_cost).toFixed(2);
    }
    setForm(f => ({ ...f, ...updates }));
  }

  function addComponent() {
    setComponents(cs => [...cs, { ...EMPTY_COMPONENT, sort_order: cs.length }]);
  }
  function setComp(idx, k, v) {
    setComponents(cs => cs.map((c, i) => i === idx ? { ...c, [k]: v } : c));
  }
  function removeComp(idx) {
    setComponents(cs => cs.filter((_, i) => i !== idx).map((c, i) => ({ ...c, sort_order: i })));
  }
  function moveComp(idx, dir) {
    setComponents(cs => {
      const next = [...cs]; const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return cs;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((c, i) => ({ ...c, sort_order: i }));
    });
  }

  // Live cost calculation
  const enrichedComponents = components.map(c => {
    if (c.type === 'recipe') {
      const r = recipes.find(r => r.id === c.recipe_id);
      return { ...c, recipe_cost_yield: r?.ingredient_cost || null };
    } else {
      const ing = allIngredients.find(i => i.id === c.ingredient_id);
      return { ...c, cost_per_gram: ing?.cost_per_gram || null };
    }
  });

  const ingredientCost = calcItemCost(enrichedComponents);
  const packagingCost  = form.include_packaging && form.packaging_cost ? parseFloat(form.packaging_cost) : 0;
  const feeInPerson    = form.include_fees && form.square_fee ? parseFloat(form.square_fee) : 0;
  const feeOnline      = form.include_fees && form.square_fee_online ? parseFloat(form.square_fee_online) : 0;
  const totalInPerson  = ingredientCost + packagingCost + feeInPerson;
  const totalOnline    = ingredientCost + packagingCost + feeOnline;
  const retail         = form.retail_price ? parseFloat(form.retail_price) : null;

  async function handleSubmit() {
    if (!form.item_name.trim()) { setTab('details'); return setErr('Item name is required.'); }
    setErr(''); setSaving(true);
    try {
      await onSave(form, components);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const tabStyle = (t) => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderBottom: tab === t ? '2px solid var(--accent2)' : '2px solid transparent',
    background: 'none', color: tab === t ? 'var(--accent2)' : 'var(--text-muted)',
  });

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">{initial?.id ? 'Edit Item' : 'New Item'}</div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 4 }}>
          <button style={tabStyle('details')} onClick={() => setTab('details')}>Details</button>
          <button style={tabStyle('components')} onClick={() => setTab('components')}>
            Components {components.length > 0 && `(${components.length})`}
          </button>
          <button style={tabStyle('costing')} onClick={() => setTab('costing')}>Costing</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>

          {tab === 'details' && (
            <div className="form-grid">
              <div className="field full">
                <label>Item Name</label>
                <input value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. S'more Brookie" />
              </div>
              <div className="field full">
                <label>Description</label>
                <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Brief description..." />
              </div>
              <div className="field">
                <label>Retail Price ($)</label>
                <input type="number" step="0.01" value={form.retail_price || ''} onChange={e => handleRetailChange(e.target.value)} placeholder="0.00" />
              </div>
              <div className="field">
                <label>Batch Qty</label>
                <input type="number" value={form.batch_qty || 1} onChange={e => set('batch_qty', e.target.value)} />
              </div>
              <div className="field">
                <label>Food Cook Time</label>
                <input value={form.food_cook_time || ''} onChange={e => set('food_cook_time', e.target.value)} placeholder="e.g. 25 min" />
              </div>
              <div className="field">
                <label>Image URL</label>
                <input value={form.image_url || ''} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
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
                <label>Square ID</label>
                <input value={form.square_id || ''} onChange={e => set('square_id', e.target.value)} />
              </div>
              <div className="field">
                <label>Woo ID</label>
                <input value={form.woo_id || ''} onChange={e => set('woo_id', e.target.value)} />
              </div>

              {/* ── Packaging ── */}
              <div className="field full" style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', textTransform: 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.include_packaging} onChange={e => handleIncludePackaging(e.target.checked)} style={{ width: 'auto' }} />
                  Include Packaging
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', textTransform: 'none', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.include_fees} onChange={e => set('include_fees', e.target.checked)} style={{ width: 'auto' }} />
                  Include Square Fees
                </label>
              </div>

              {form.include_packaging && (
                <div className="field">
                  <label>
                    Packaging Cost ($)
                    {settings.packaging_cost && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        default ${parseFloat(settings.packaging_cost).toFixed(2)}
                      </span>
                    )}
                  </label>
                  <input
                    type="number" step="0.01"
                    value={form.packaging_cost || ''}
                    onChange={e => set('packaging_cost', e.target.value)}
                    placeholder={settings.packaging_cost ? parseFloat(settings.packaging_cost).toFixed(2) : '0.00'}
                  />
                </div>
              )}

              {form.include_fees && (
                <>
                  <div className="field">
                    <label>
                      In-Person Fee ($)
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        {settings.square_fee_rate
                          ? `${(parseFloat(settings.square_fee_rate) * 100).toFixed(1)}% + $${settings.square_fee_flat}`
                          : '2.6% + $0.15'}
                      </span>
                    </label>
                    <input
                      type="number" step="0.01"
                      value={form.square_fee || ''}
                      onChange={e => set('square_fee', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="field">
                    <label>
                      Online Fee ($)
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                        {settings.square_fee_online_rate
                          ? `${(parseFloat(settings.square_fee_online_rate) * 100).toFixed(1)}% + $${settings.square_fee_online_flat}`
                          : '3.3% + $0.30'}
                      </span>
                    </label>
                    <input
                      type="number" step="0.01"
                      value={form.square_fee_online || ''}
                      onChange={e => set('square_fee_online', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'components' && (
            <div>
              {components.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>No components yet. Add recipes or ingredients that make up this item.</div>
              )}
              {components.map((comp, idx) => (
                <ComponentRow
                  key={idx}
                  comp={comp}
                  idx={idx}
                  total={components.length}
                  recipes={recipes}
                  allIngredients={allIngredients}
                  onChange={(k, v) => setComp(idx, k, v)}
                  onRemove={() => removeComp(idx)}
                  onMove={(dir) => moveComp(idx, dir)}
                />
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addComponent}>+ Add Component</button>
            </div>
          )}

          {tab === 'costing' && (
            <div>
              {/* ── Dual-channel comparison ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'In-Person / Events', total: totalInPerson, fee: feeInPerson },
                  { label: 'Online / Woo',        total: totalOnline,   fee: feeOnline  },
                ].map(({ label, total, fee }) => (
                  <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>{label}</div>
                    <CostRow label="Ingredient / Recipe" value={ingredientCost} />
                    <CostRow label="Packaging"           value={packagingCost} muted={!form.include_packaging} />
                    <CostRow label="Square Fee"          value={fee}           muted={!form.include_fees} />
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                      <CostRow label="Total Cost" value={total} bold />
                      {retail != null && <CostRow label="Retail" value={retail} />}
                      {retail != null && (
                        <CostRow
                          label="Margin"
                          value={retail - total}
                          bold
                          note={`${(((retail - total) / retail) * 100).toFixed(1)}%`}
                          positive={retail - total > 0}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Component breakdown ── */}
              {components.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Component Breakdown</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Component', 'Type', 'Qty', 'Cost'].map(h => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedComponents.map((c, idx) => {
                        const name = c.type === 'recipe'
                          ? recipes.find(r => r.id === c.recipe_id)?.recipe_name
                          : allIngredients.find(i => i.id === c.ingredient_id)?.item_name;
                        const cost = c.type === 'recipe'
                          ? (c.recipe_cost_yield && c.quantity ? parseFloat(c.recipe_cost_yield) * parseFloat(c.quantity) : null)
                          : (c.cost_per_gram && c.quantity && c.unit === 'g' ? parseFloat(c.cost_per_gram) * parseFloat(c.quantity) : null);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px 6px 0', fontSize: 13 }}>{name || <span style={{ color: 'var(--text-muted)' }}>— not selected —</span>}</td>
                            <td style={{ padding: '6px 8px 6px 0', fontSize: 12, color: 'var(--text-muted)' }}>{c.type}</td>
                            <td style={{ padding: '6px 8px 6px 0', fontSize: 13 }}>{c.quantity || '—'} {c.unit || ''}</td>
                            <td style={{ padding: '6px 0', fontSize: 12, fontFamily: 'monospace', color: cost ? 'var(--text)' : 'var(--text-muted)' }}>
                              {cost ? `$${cost.toFixed(4)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!settings.packaging_cost && (
                <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                  💡 Set packaging cost and Square fee rates in Settings to auto-populate these fields.
                </div>
              )}
            </div>
          )}
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CostRow({ label, value, muted, bold, note, positive }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: bold ? 13 : 12,
        fontWeight: bold ? 700 : 400,
        fontFamily: 'monospace',
        color: muted
          ? 'var(--text-muted)'
          : positive === true  ? 'var(--green, #4caf50)'
          : positive === false ? 'var(--red, #e55)'
          : 'var(--text)',
      }}>
        ${typeof value === 'number' ? value.toFixed(2) : '—'}
        {note && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'sans-serif', marginLeft: 5 }}>{note}</span>}
      </span>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────
function ItemDetail({ item: initialItem, recipes, allIngredients, settings, onEdit, onClose }) {
  const [item, setItem]       = useState(initialItem);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/items/${initialItem.id}`)
      .then(data => setItem(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [initialItem.id]);

  const components     = (item.items || []).map(c => ({ ...c, type: c.recipe_id ? 'recipe' : 'ingredient' }));
  const ingredientCost = calcItemCost(components);
  const packagingCost  = item.include_packaging && item.packaging_cost ? parseFloat(item.packaging_cost) : 0;
  const feeInPerson    = item.include_fees && item.square_fee ? parseFloat(item.square_fee) : 0;
  const feeOnline      = item.include_fees && item.square_fee_online ? parseFloat(item.square_fee_online) : 0;
  const totalInPerson  = ingredientCost + packagingCost + feeInPerson;
  const totalOnline    = ingredientCost + packagingCost + feeOnline;
  const retail         = item.retail_price ? parseFloat(item.retail_price) : null;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? <div className="loading">Loading…</div> : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{item.item_name}</div>
            {item.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{item.description}</p>}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {components.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Components</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {components.map((c, idx) => {
                        const name = c.recipe_id
                          ? recipes.find(r => r.id === c.recipe_id)?.recipe_name
                          : allIngredients.find(i => i.id === c.ingredient_id)?.item_name;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px 6px 0', fontSize: 13 }}>{name || '—'}</td>
                            <td style={{ padding: '6px 0', fontSize: 12, color: 'var(--text-muted)' }}>{c.type}</td>
                            <td style={{ padding: '6px 0', fontSize: 13, textAlign: 'right' }}>{c.quantity || '—'} {c.unit || ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Dual-channel summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'In-Person', total: totalInPerson },
                  { label: 'Online',    total: totalOnline   },
                ].map(({ label, total }) => (
                  <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                    <CostRow label="Total Cost" value={total} bold />
                    {retail != null && <CostRow label="Retail" value={retail} />}
                    {retail != null && (
                      <CostRow
                        label="Margin"
                        value={retail - total}
                        bold
                        note={`${(((retail - total) / retail) * 100).toFixed(1)}%`}
                        positive={retail - total > 0}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 20 }}>
                <DetailRow label="Retail Price" value={fmtPrice(item.retail_price)} />
                <DetailRow label="Packaging"    value={item.include_packaging ? fmtPrice(item.packaging_cost) : 'No'} />
                {item.square_id      && <DetailRow label="Square ID" value={item.square_id} />}
                {item.contains_label && <DetailRow label="Contains"  value={item.contains_label} />}
              </div>

              {item.ingredient_label && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Ingredient Label</div>
                  <div style={{ fontSize: 12 }}>{item.ingredient_label}</div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              <button className="btn btn-primary" onClick={onEdit}>Edit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text)' : 'var(--text-muted)' }}>{value || '—'}</div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────
function DeleteConfirm({ item, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Delete Item</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{item.item_name}</strong>? This cannot be undone.
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

// ── ItemBuilder Page ──────────────────────────────────────
export function ItemBuilderPage() {
  const [items, setItems]               = useState([]);
  const [recipes, setRecipes]           = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [settings, setSettings]         = useState({});
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [modal, setModal]               = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [its, recs, ings, sets] = await Promise.all([
        api.get('/items'),
        api.get('/recipes'),
        api.get('/ingredients'),
        api.get('/settings'),
      ]);
      setItems(its);
      setRecipes(recs);
      setAllIngredients(ings);
      const map = {};
      sets.forEach(s => { map[s.key] = s.value; });
      setSettings(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i =>
    !search || i.item_name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(form, components) {
    let saved;
    if (modal.item?.id) {
      saved = await api.put(`/items/${modal.item.id}`, form);
    } else {
      saved = await api.post('/items', form);
    }
    await api.put(`/items/${saved.id}/items`, { items: components });
    setModal(null);
    load();
  }

  async function handleDelete() {
    await api.delete(`/items/${modal.item.id}`);
    setModal(null);
    load();
  }

  async function handleSquarePush(item) {
    try {
      const result = await api.post(`/square/push/${item.id}`, {});
      alert(`${result.action === 'created' ? 'Created' : 'Updated'} in Square ✓`);
      load();
    } catch (e) {
      alert(`Square error: ${e.message}`);
    }
  }

  async function handleDuplicate(item) {
    const full = await api.get(`/items/${item.id}`);
    setModal({
      mode: 'new',
      item: {
        ...full,
        id: undefined,
        item_name: `Copy of ${full.item_name}`,
        square_id: '',
        woo_id: '',
      },
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧁 ItemBuilder</div>
          <div className="page-subtitle">{items.length} item{items.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => setModal({ mode: 'import' })}>↑ Import</button>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>+ New Item</button>
      </div>

      <div className="search-bar">
        <input
          style={{ flex: 1, maxWidth: 320, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🧁</div>
            <p>{search ? 'No items match your search.' : 'No items yet. Add your first item to get started.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Retail</th>
                  <th>Packaging</th>
                  <th>Fees</th>
                  <th>Square</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id}>
                    <td>
                      <div
                        style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--accent2)' }}
                        onClick={() => setModal({ mode: 'detail', item: i })}
                      >
                        {i.item_name}
                      </div>
                      {i.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.description}</div>}
                    </td>
                    <td>{fmtPrice(i.retail_price)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{i.include_packaging ? '✓' : '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{i.include_fees ? '✓' : '—'}</td>
                    <td>
                      {i.square_id
                        ? <span style={{ fontSize: 11, color: 'var(--green, #4caf50)', fontWeight: 600 }}>✓ Synced</span>
                        : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div className="actions">
                        <RowMenu actions={[
                          { label: 'Edit',      onClick: () => setModal({ mode: 'edit', item: i }) },
                          { label: 'Duplicate', onClick: () => handleDuplicate(i) },
                          { label: i.square_id ? '↑ Push to Square' : '→ Push to Square', onClick: () => handleSquarePush(i) },
                          { label: 'Delete',    onClick: () => setModal({ mode: 'delete', item: i }), danger: true },
                        ]} />
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
        <ItemDetail
          item={modal.item}
          recipes={recipes}
          allIngredients={allIngredients}
          settings={settings}
          onEdit={() => setModal({ mode: 'edit', item: modal.item })}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.mode === 'new' || modal?.mode === 'edit') && (
        <ItemForm
          initial={modal.item}
          recipes={recipes}
          allIngredients={allIngredients}
          settings={settings}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirm
          item={modal.item}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'import' && (
        <ItemBuilderImportModal
          existingNames={new Set(items.map(i => i.item_name.toLowerCase()))}
          onClose={() => setModal(null)}
          onDone={load}
        />
      )}
    </div>
  );
}
