import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { RecipesImportModal } from './RecipesImportModal.jsx';

// ── Constants ─────────────────────────────────────────────
const EMPTY_FORM = {
  recipe_name: '', recipe_type: '', stage: 'production', description: '',
  serving_size: '', prep_time: '', cook_time: '', image_url: '',
  ingredient_label: '', contains_label: '', square_id: '', woo_id: '', notes: '',
};
const EMPTY_ING  = { ingredient_id: '', ingredient: '', amount: '', measurement: '' };
const EMPTY_STEP = { step_number: 1, step_type: 'regular', step_description: '', step_time: '',
  requires_notification: false, fold_type: '', fold_interval: '', temp_min: '', temp_max: '' };
const MEASUREMENTS = ['g','kg','ml','L','tsp','tbsp','cup','oz','lb','pinch','piece','slice','clove','sprig','bunch'];
const STAGES       = ['development','testing','production'];
const STAGE_BADGE  = { development:'badge-gray', testing:'badge-blue', production:'badge-green' };
const PRESETS      = [
  { label:'¼x', value:0.25 }, { label:'½x', value:0.5 }, { label:'¾x', value:0.75 },
  { label:'1x', value:1 }, { label:'1½x', value:1.5 }, { label:'2x', value:2 }, { label:'3x', value:3 },
];
const FOLD_TYPES_MAKE = ['S&F', 'Coil', 'Lamination'];

// ── Helpers ───────────────────────────────────────────────
function calcCost(ingredients) {
  return ingredients.reduce((t, ing) => {
    if (!ing.cost_per_gram || !ing.amount || ing.measurement !== 'g') return t;
    return t + parseFloat(ing.cost_per_gram) * parseFloat(ing.amount);
  }, 0);
}
function fmtAmount(amount, multiplier) {
  if (!amount) return '';
  const n = parseFloat(n2 => n2, parseFloat(amount) * multiplier);
  const clean = parseFloat((parseFloat(amount) * multiplier).toPrecision(6));
  return clean % 1 === 0 ? clean.toString() : clean.toFixed(1);
}
function fmtTimestamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
}

// ── Fold Row (Make) ───────────────────────────────────────
function FoldRow({ fold, onUpdate, onRemove }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 100px 110px 36px', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ fontWeight:700, fontSize:13, color:'var(--text-muted)', textAlign:'center' }}>{fold.number}</div>
      <select value={fold.type} onChange={e => onUpdate('type', e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 8px', color:'var(--text)', fontSize:13 }}>
        <option value="">— Type —</option>
        {FOLD_TYPES_MAKE.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input type="number" step="0.1" placeholder="Temp °F" value={fold.temp} onChange={e => onUpdate('temp', e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 8px', color:'var(--text)', fontSize:13, width:'100%' }} />
      <button onClick={() => onUpdate('time', fold.time ? null : Date.now())}
        style={{ background:fold.time?'var(--accent)':'var(--surface2)', border:`1px solid ${fold.time?'var(--accent)':'var(--border)'}`,
          borderRadius:6, padding:'6px 8px', color:fold.time?'#fff':'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer',
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {fold.time ? fmtTimestamp(fold.time) : '⏱ Done'}
      </button>
      <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:16, padding:'4px' }}>✕</button>
    </div>
  );
}

// ── Make View ─────────────────────────────────────────────
function MakeView({ recipe, onClose }) {
  const [multiplier, setMultiplier]   = useState(1);
  const [customYield, setCustomYield] = useState('');
  const [folds, setFolds]             = useState([]);
  const [nextFoldNum, setNextFoldNum] = useState(1);

  const servingSize = parseFloat(recipe.serving_size) || 1;
  const hasFolds    = recipe.steps?.some(s => s.step_type === 'fold');
  const scaledYield = Math.round(servingSize * multiplier * 10) / 10;

  function applyPreset(val) { setMultiplier(val); setCustomYield(''); }
  function handleCustomYield(val) {
    setCustomYield(val);
    const n = parseFloat(val);
    if (n > 0) setMultiplier(n / servingSize);
  }
  function addFolds(count) {
    const newFolds = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i, number: nextFoldNum + i, type: '', temp: '', time: null
    }));
    setFolds(f => [...f, ...newFolds]);
    setNextFoldNum(n => n + count);
  }
  function updateFold(id, key, val) { setFolds(f => f.map(fold => fold.id === id ? { ...fold, [key]: val } : fold)); }
  function removeFold(id) {
    setFolds(f => f.filter(fold => fold.id !== id).map((fold, i) => ({ ...fold, number: i + 1 })));
    setNextFoldNum(n => Math.max(1, n - 1));
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth:820, maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:700 }}>{recipe.recipe_name}</div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>
              {[recipe.recipe_type, recipe.prep_time?`Prep ${recipe.prep_time}`:null, recipe.cook_time?`Cook ${recipe.cook_time}`:null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20, padding:4 }}>✕</button>
        </div>

        {/* Batch size */}
        <div style={{ background:'var(--surface2)', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:10 }}>Batch Size</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
            {PRESETS.map(p => (
              <button key={p.value} onClick={() => applyPreset(p.value)} style={{
                padding:'5px 12px', fontSize:13, fontWeight:600, borderRadius:6, cursor:'pointer',
                border:'1px solid var(--border)',
                background: multiplier === p.value && !customYield ? 'var(--accent2)' : 'var(--surface)',
                color: multiplier === p.value && !customYield ? '#fff' : 'var(--text)',
              }}>{p.label}</button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>I need</span>
            <input type="number" min="0.1" step="1" value={customYield} onChange={e => handleCustomYield(e.target.value)}
              placeholder={String(servingSize)}
              style={{ width:72, background:'var(--surface)', border:`1px solid ${customYield?'var(--accent2)':'var(--border)'}`,
                borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:14, fontWeight:600 }} />
            <span style={{ fontSize:13, color:'var(--text-muted)' }}>{recipe.recipe_type?.toLowerCase() || 'units'}</span>
            <span style={{ marginLeft:'auto', fontSize:13, color:'var(--text-muted)' }}>
              <strong style={{ color:'var(--text)', fontFamily:'monospace' }}>
                {multiplier % 1 === 0 ? multiplier : multiplier.toFixed(3)}x
              </strong>
              {recipe.serving_size && (
                <span style={{ marginLeft:8 }}>→ <strong style={{ color:'var(--accent2)' }}>{scaledYield}</strong> {recipe.recipe_type?.toLowerCase() || 'units'}</span>
              )}
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

            {/* Ingredients */}
            {recipe.ingredients?.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Ingredients</div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <tbody>
                    {recipe.ingredients.map(ing => {
                      const n = ing.amount ? parseFloat((parseFloat(ing.amount) * multiplier).toPrecision(6)) : null;
                      const scaled = n !== null ? (n % 1 === 0 ? n.toString() : n.toFixed(1)) : '';
                      return (
                        <tr key={ing.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'7px 8px 7px 0', fontSize:13 }}>{ing.ingredient}</td>
                          <td style={{ padding:'7px 0', fontSize:13, textAlign:'right', whiteSpace:'nowrap' }}>
                            {scaled ? (
                              <><strong style={{ color:'var(--accent2)', fontFamily:'monospace' }}>{scaled}</strong>
                              {ing.measurement && <span style={{ color:'var(--text-muted)', marginLeft:4 }}>{ing.measurement}</span>}</>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Steps */}
            {recipe.steps?.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Steps</div>
                <ol style={{ paddingLeft:18, margin:0 }}>
                  {recipe.steps.map(s => (
                    <li key={s.id} style={{ fontSize:13, marginBottom:10, lineHeight:1.6 }}>
                      {s.step_type === 'fold' ? (
                        <span>
                          <strong style={{ color:'var(--accent2)' }}>Fold</strong>
                          {s.fold_type && <span style={{ color:'var(--text-muted)' }}> — {s.fold_type}</span>}
                          {s.step_time && <span style={{ color:'var(--text-muted)' }}> · {s.step_time}</span>}
                          {s.fold_interval && <span style={{ color:'var(--text-muted)' }}> · every {s.fold_interval}</span>}
                          {(s.temp_min || s.temp_max) && <span style={{ color:'var(--text-muted)' }}> · {s.temp_min}°–{s.temp_max}°F</span>}
                          {s.step_description && <div style={{ color:'var(--text-muted)', fontSize:12, marginTop:2 }}>{s.step_description}</div>}
                        </span>
                      ) : (
                        <span>
                          {s.step_description}
                          {s.step_time && <span style={{ color:'var(--text-muted)', fontSize:12 }}> — {s.step_time}</span>}
                          {s.requires_notification && <span style={{ marginLeft:6, fontSize:11, color:'var(--accent2)' }}>⏰</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Fold tracking */}
          {hasFolds && (
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:16, marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>Fold Tracking</div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--text-muted)', marginRight:2 }}>Add</span>
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={() => addFolds(n)}
                      style={{ width:30, height:30, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {folds.length === 0 ? (
                <div style={{ color:'var(--text-muted)', fontSize:13, textAlign:'center', padding:'12px 0' }}>Tap a number above to add fold rows.</div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 100px 110px 36px', gap:8, paddingBottom:6, borderBottom:'2px solid var(--border)' }}>
                    {['#','Type','Temp °F','Time',''].map(h => (
                      <div key={h} style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px' }}>{h}</div>
                    ))}
                  </div>
                  {folds.map(fold => (
                    <FoldRow key={fold.id} fold={fold}
                      onUpdate={(key, val) => updateFold(fold.id, key, val)}
                      onRemove={() => removeFold(fold.id)} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Notes */}
          {recipe.notes && (
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>Notes</div>
              <div style={{ fontSize:13, lineHeight:1.7, whiteSpace:'pre-wrap', color:'var(--text-muted)' }}>{recipe.notes}</div>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop:16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Add Ingredient ──────────────────────────────────
function QuickAddIngredient({ onSave, onCancel }) {
  const [form, setForm] = useState({ item_name:'', purchase_from:'', grams:'', current_price:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function handleSubmit() {
    if (!form.item_name.trim()) return setErr('Item name is required.');
    setSaving(true); setErr('');
    try { const saved = await api.post('/ingredients', form); onSave(saved); }
    catch (e) { setErr(e.message || 'Save failed.'); }
    finally { setSaving(false); }
  }
  return (
    <div className="modal-backdrop" style={{ zIndex:300 }} onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth:400 }}>
        <div className="modal-title">Quick Add Ingredient</div>
        <div className="form-grid">
          <div className="field full"><label>Item Name</label><input autoFocus value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. Bread Flour" /></div>
          <div className="field full"><label>Purchase From</label><input value={form.purchase_from} onChange={e => set('purchase_from', e.target.value)} placeholder="e.g. Restaurant Depot" /></div>
          <div className="field"><label>Package Size (g)</label><input type="number" value={form.grams} onChange={e => set('grams', e.target.value)} placeholder="e.g. 2267" /></div>
          <div className="field"><label>Current Price ($)</label><input type="number" step="0.01" value={form.current_price} onChange={e => set('current_price', e.target.value)} placeholder="0.00" /></div>
        </div>
        {err && <div className="error-msg" style={{ marginTop:8 }}>{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Add Ingredient'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Step Row ──────────────────────────────────────────────
function StepRow({ step, idx, total, onChange, onRemove, onMove }) {
  const isFold = step.step_type === 'fold';
  return (
    <div style={{ background:'var(--surface2)', border:`1px solid ${isFold?'var(--accent2)':'var(--border)'}`, borderRadius:6, padding:10, marginBottom:8 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
        <div style={{ fontWeight:700, fontSize:13, color:'var(--text-muted)', minWidth:24 }}>{step.step_number}.</div>
        <div style={{ display:'flex', gap:4 }}>
          {['regular','fold'].map(t => (
            <button key={t} onClick={() => onChange('step_type', t)} style={{
              padding:'3px 10px', fontSize:11, fontWeight:600, borderRadius:4, cursor:'pointer', border:'1px solid var(--border)',
              background: step.step_type===t ? 'var(--accent2)' : 'var(--surface)',
              color: step.step_type===t ? '#fff' : 'var(--text-muted)',
            }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:2 }}>
          <button onClick={() => onMove(-1)} disabled={idx===0} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px 4px' }}>↑</button>
          <button onClick={() => onMove(1)} disabled={idx===total-1} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:'2px 4px' }}>↓</button>
          <button onClick={onRemove} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--red,#e55)', padding:'2px 4px' }}>✕</button>
        </div>
      </div>
      {isFold ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div>
            <label style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Fold Type</label>
            <select value={step.fold_type||''} onChange={e => onChange('fold_type', e.target.value)}
              style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13 }}>
              <option value="">— Select —</option>
              {['Stretch & Fold','Coil','Lamination'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Total Duration</label>
            <input value={step.step_time||''} onChange={e => onChange('step_time', e.target.value)} placeholder="e.g. 3 hours"
              style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Interval</label>
            <input value={step.fold_interval||''} onChange={e => onChange('fold_interval', e.target.value)} placeholder="e.g. every 30 min"
              style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Temp Range (°F)</label>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input type="number" step="0.1" value={step.temp_min||''} onChange={e => onChange('temp_min', e.target.value)} placeholder="Min"
                style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13 }} />
              <span style={{ color:'var(--text-muted)', fontSize:12 }}>–</span>
              <input type="number" step="0.1" value={step.temp_max||''} onChange={e => onChange('temp_max', e.target.value)} placeholder="Max"
                style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13 }} />
            </div>
          </div>
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', display:'block', marginBottom:3 }}>Notes (optional)</label>
            <input value={step.step_description||''} onChange={e => onChange('step_description', e.target.value)} placeholder="Any additional fold notes..."
              style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'5px 8px', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
          </div>
        </div>
      ) : (
        <div>
          <textarea value={step.step_description} onChange={e => onChange('step_description', e.target.value)} placeholder="Describe this step..."
            style={{ width:'100%', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'6px 8px', color:'var(--text)', fontSize:13, resize:'vertical', minHeight:56, boxSizing:'border-box' }} />
          <div style={{ display:'flex', gap:10, marginTop:6, alignItems:'center' }}>
            <input placeholder="Time (e.g. 30 min)" value={step.step_time||''} onChange={e => onChange('step_time', e.target.value)}
              style={{ width:140, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'4px 8px', color:'var(--text)', fontSize:12 }} />
            <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--text-muted)', cursor:'pointer' }}>
              <input type="checkbox" checked={!!step.requires_notification} onChange={e => onChange('requires_notification', e.target.checked)} style={{ width:'auto' }} />
              Notify
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recipe Form ───────────────────────────────────────────
function RecipeForm({ initial, allIngredients: initialAllIngredients, onSave, onCancel }) {
  const [form, setForm]               = useState({ ...EMPTY_FORM, ...initial });
  const [ingredients, setIngredients] = useState(initial?.ingredients || []);
  const [steps, setSteps]             = useState(initial?.steps || []);
  const [allIngredients, setAllIngredients] = useState(initialAllIngredients || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [quickAdd, setQuickAdd] = useState(false);
  const [tab, setTab]       = useState('details');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function addIngredient() { setIngredients(i => [...i, { ...EMPTY_ING, sort_order: i.length }]); }
  function setIng(idx, k, v) {
    setIngredients(ings => ings.map((ing, i) => {
      if (i !== idx) return ing;
      const u = { ...ing, [k]: v };
      if (k === 'ingredient_id') {
        const f = allIngredients.find(a => a.id === v);
        if (f) { u.ingredient = f.item_name; u.cost_per_gram = f.cost_per_gram || null; }
      }
      return u;
    }));
  }
  function removeIng(idx) { setIngredients(i => i.filter((_,j)=>j!==idx).map((x,j)=>({...x,sort_order:j}))); }
  function moveIng(idx, dir) {
    setIngredients(i => {
      const n=[...i], s=idx+dir;
      if(s<0||s>=n.length) return i;
      [n[idx],n[s]]=[n[s],n[idx]];
      return n.map((x,j)=>({...x,sort_order:j}));
    });
  }
  function addStep() { setSteps(s => [...s, { ...EMPTY_STEP, step_number: s.length+1 }]); }
  function setStep(idx, k, v) { setSteps(s => s.map((x,i)=>i===idx?{...x,[k]:v}:x)); }
  function removeStep(idx) { setSteps(s => s.filter((_,i)=>i!==idx).map((x,i)=>({...x,step_number:i+1}))); }
  function moveStep(idx, dir) {
    setSteps(s => {
      const n=[...s], sw=idx+dir;
      if(sw<0||sw>=n.length) return s;
      [n[idx],n[sw]]=[n[sw],n[idx]];
      return n.map((x,i)=>({...x,step_number:i+1}));
    });
  }
  async function handleSubmit() {
    if (!form.recipe_name.trim()) { setTab('details'); return setErr('Recipe name is required.'); }
    const bad = ingredients.find(i => !i.ingredient_id);
    if (bad) { setTab('ingredients'); return setErr('All ingredient rows must have an ingredient selected.'); }
    setErr(''); setSaving(true);
    try { await onSave(form, ingredients, steps); }
    catch(e) { setErr(e.message||'Save failed.'); }
    finally { setSaving(false); }
  }
  function handleQuickAdded(newIng, idx) {
    setAllIngredients(a => [...a, newIng]);
    setIng(idx, 'ingredient_id', newIng.id);
    setQuickAdd(false);
  }
  const costTotal = calcCost(ingredients);
  const tabStyle = t => ({ padding:'7px 16px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none',
    borderBottom: tab===t ? '2px solid var(--accent2)' : '2px solid transparent',
    background:'none', color: tab===t ? 'var(--accent2)' : 'var(--text-muted)' });

  return (
    <>
      <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && onCancel()}>
        <div className="modal" style={{ maxWidth:740, maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div className="modal-title">{initial?.id ? 'Edit Recipe' : 'New Recipe'}</div>
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', marginBottom:20, gap:4 }}>
            <button style={tabStyle('details')} onClick={()=>setTab('details')}>Details</button>
            <button style={tabStyle('ingredients')} onClick={()=>setTab('ingredients')}>Ingredients {ingredients.length>0&&`(${ingredients.length})`}</button>
            <button style={tabStyle('steps')} onClick={()=>setTab('steps')}>Steps {steps.length>0&&`(${steps.length})`}</button>
          </div>
          <div style={{ overflowY:'auto', flex:1, paddingRight:4 }}>
            {tab==='details' && (
              <div className="form-grid">
                <div className="field full"><label>Recipe Name</label><input value={form.recipe_name} onChange={e=>set('recipe_name',e.target.value)} placeholder="e.g. Sourdough Boule" /></div>
                <div className="field"><label>Type</label><input value={form.recipe_type||''} onChange={e=>set('recipe_type',e.target.value)} placeholder="e.g. Bread, Pastry, Cookie" /></div>
                <div className="field"><label>Stage</label>
                  <select value={form.stage||'production'} onChange={e=>set('stage',e.target.value)}>
                    {STAGES.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field"><label>Serving Size</label><input type="number" value={form.serving_size||''} onChange={e=>set('serving_size',e.target.value)} placeholder="e.g. 12" /></div>
                <div className="field"><label>Prep Time</label><input value={form.prep_time||''} onChange={e=>set('prep_time',e.target.value)} placeholder="e.g. 30 min" /></div>
                <div className="field"><label>Cook Time</label><input value={form.cook_time||''} onChange={e=>set('cook_time',e.target.value)} placeholder="e.g. 45 min" /></div>
                <div className="field full"><label>Description</label><textarea value={form.description||''} onChange={e=>set('description',e.target.value)} placeholder="Brief description..." /></div>
                <div className="field full"><label>Notes</label><textarea value={form.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="Internal notes..." /></div>
                <div className="field"><label>Ingredient Label</label><input value={form.ingredient_label||''} onChange={e=>set('ingredient_label',e.target.value)} placeholder="For packaging..." /></div>
                <div className="field"><label>Contains Label</label><input value={form.contains_label||''} onChange={e=>set('contains_label',e.target.value)} placeholder="e.g. Wheat, Eggs, Dairy" /></div>
                <div className="field"><label>Image URL</label><input value={form.image_url||''} onChange={e=>set('image_url',e.target.value)} placeholder="https://..." /></div>
                <div className="field"><label>Square ID</label><input value={form.square_id||''} onChange={e=>set('square_id',e.target.value)} /></div>
              </div>
            )}
            {tab==='ingredients' && (
              <div>
                {ingredients.length===0 ? <div style={{color:'var(--text-muted)',fontSize:13,marginBottom:16}}>No ingredients yet.</div> : (
                  <table style={{width:'100%',borderCollapse:'collapse',marginBottom:12}}>
                    <thead><tr>{['Ingredient','Amount','Unit','Cost',''].map(h=>(
                      <th key={h} style={{textAlign:'left',fontSize:11,color:'var(--text-muted)',fontWeight:600,padding:'4px 8px 8px 0',textTransform:'uppercase'}}>{h}</th>
                    ))}</tr></thead>
                    <tbody>
                      {ingredients.map((ing,idx)=>{
                        const c=ing.cost_per_gram&&ing.amount&&ing.measurement==='g'?parseFloat(ing.cost_per_gram)*parseFloat(ing.amount):null;
                        return (
                          <tr key={idx}>
                            <td style={{padding:'4px 8px 4px 0',minWidth:180}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <select value={ing.ingredient_id||''} onChange={e=>setIng(idx,'ingredient_id',e.target.value)}
                                  style={{flex:1,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:4,padding:'5px 8px',color:'var(--text)',fontSize:13}}>
                                  <option value="">— Select —</option>
                                  {allIngredients.map(a=><option key={a.id} value={a.id}>{a.item_name}</option>)}
                                </select>
                                <button title="Quick add" onClick={()=>setQuickAdd(idx)}
                                  style={{background:'none',border:'1px solid var(--border)',borderRadius:4,padding:'4px 7px',cursor:'pointer',color:'var(--accent2)',fontSize:13,lineHeight:1}}>+</button>
                              </div>
                            </td>
                            <td style={{padding:'4px 8px 4px 0',width:80}}>
                              <input type="number" step="0.0001" value={ing.amount||''} onChange={e=>setIng(idx,'amount',e.target.value)}
                                style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:4,padding:'5px 8px',color:'var(--text)',fontSize:13}} />
                            </td>
                            <td style={{padding:'4px 8px 4px 0',width:90}}>
                              <select value={ing.measurement||''} onChange={e=>setIng(idx,'measurement',e.target.value)}
                                style={{width:'100%',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:4,padding:'5px 8px',color:'var(--text)',fontSize:13}}>
                                <option value="">—</option>
                                {MEASUREMENTS.map(m=><option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td style={{padding:'4px 8px 4px 0',width:80,fontSize:12,color:c?'var(--text)':'var(--text-muted)',fontFamily:'monospace'}}>
                              {c?`$${c.toFixed(4)}`:'—'}
                            </td>
                            <td style={{padding:'4px 0',whiteSpace:'nowrap'}}>
                              <button onClick={()=>moveIng(idx,-1)} disabled={idx===0} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',padding:'2px 4px'}}>↑</button>
                              <button onClick={()=>moveIng(idx,1)} disabled={idx===ingredients.length-1} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',padding:'2px 4px'}}>↓</button>
                              <button onClick={()=>removeIng(idx)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--red,#e55)',padding:'2px 4px'}}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <button className="btn btn-secondary btn-sm" onClick={addIngredient}>+ Add Ingredient</button>
                  {costTotal>0&&<div style={{fontSize:13,color:'var(--text-muted)'}}>Cost: <strong style={{color:'var(--text)'}}>${costTotal.toFixed(4)}</strong> <span style={{fontSize:11}}>(grams only)</span></div>}
                </div>
              </div>
            )}
            {tab==='steps' && (
              <div>
                {steps.length===0&&<div style={{color:'var(--text-muted)',fontSize:13,marginBottom:12}}>No steps yet.</div>}
                {steps.map((step,idx)=>(
                  <StepRow key={idx} step={step} idx={idx} total={steps.length}
                    onChange={(k,v)=>setStep(idx,k,v)} onRemove={()=>removeStep(idx)} onMove={dir=>moveStep(idx,dir)} />
                ))}
                <button className="btn btn-secondary btn-sm" onClick={addStep}>+ Add Step</button>
              </div>
            )}
          </div>
          {err&&<div className="error-msg" style={{marginTop:12}}>{err}</div>}
          <div className="modal-actions" style={{marginTop:20}}>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving?'Saving…':'Save Recipe'}</button>
          </div>
        </div>
      </div>
      {quickAdd!==false&&<QuickAddIngredient onSave={newIng=>handleQuickAdded(newIng,quickAdd)} onCancel={()=>setQuickAdd(false)} />}
    </>
  );
}

// ── Detail Modal ──────────────────────────────────────────
function RecipeDetail({ recipe: initialRecipe, onEdit, onMake, onClose }) {
  const [recipe, setRecipe] = useState(initialRecipe);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/recipes/${initialRecipe.id}`).then(d=>setRecipe(d)).catch(console.error).finally(()=>setLoading(false));
  }, [initialRecipe.id]);

  function handlePrint() {
    const w = window.open('','_blank');
    const ings = (recipe.ingredients||[]).map(i=>`<tr><td>${i.ingredient}</td><td>${i.amount||''} ${i.measurement||''}</td></tr>`).join('');
    const st = (recipe.steps||[]).map(s => {
      if (s.step_type==='fold') {
        const d=[s.fold_type,s.step_time?`Duration: ${s.step_time}`:null,s.fold_interval?`Interval: ${s.fold_interval}`:null,
          (s.temp_min||s.temp_max)?`Temp: ${s.temp_min||'?'}°–${s.temp_max||'?'}°F`:null,s.step_description||null].filter(Boolean).join(' · ');
        return `<li style="margin-bottom:8px"><strong>Fold: ${d}</strong></li>`;
      }
      return `<li style="margin-bottom:8px">${s.step_description}${s.step_time?` <em>(${s.step_time})</em>`:''}</li>`;
    }).join('');
    w.document.write(`<html><head><title>${recipe.recipe_name}</title><style>body{font-family:sans-serif;max-width:680px;margin:40px auto;color:#111}h1{font-size:24px;margin-bottom:4px}.meta{color:#666;font-size:13px;margin-bottom:20px}h2{font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#444;margin:24px 0 10px}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:left}th{font-weight:600;color:#666}ol{padding-left:20px;font-size:13px;line-height:1.7}</style></head><body>
    <h1>${recipe.recipe_name}</h1><div class="meta">${recipe.recipe_type?`Type: ${recipe.recipe_type} &nbsp;|&nbsp; `:''}${recipe.stage?`Stage: ${recipe.stage} &nbsp;|&nbsp; `:''}${recipe.serving_size?`Serves: ${recipe.serving_size} &nbsp;|&nbsp; `:''}${recipe.prep_time?`Prep: ${recipe.prep_time} &nbsp;|&nbsp; `:''}${recipe.cook_time?`Cook: ${recipe.cook_time}`:''}</div>
    ${recipe.description?`<p style="font-size:13px;color:#444">${recipe.description}</p>`:''}
    ${ings?`<h2>Ingredients</h2><table><thead><tr><th>Ingredient</th><th>Amount</th></tr></thead><tbody>${ings}</tbody></table>`:''}
    ${st?`<h2>Steps</h2><ol>${st}</ol>`:''}
    ${recipe.notes?`<h2>Notes</h2><p style="font-size:13px">${recipe.notes}</p>`:''}
    </body></html>`);
    w.document.close(); w.print();
  }

  const costTotal = calcCost(recipe.ingredients||[]);
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:660,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        {loading ? <div className="loading">Loading…</div> : <>
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
              <div style={{fontSize:20,fontWeight:700}}>{recipe.recipe_name}</div>
              <span className={`badge ${STAGE_BADGE[recipe.stage]||'badge-gray'}`}>{recipe.stage||'production'}</span>
            </div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:3}}>
              {[recipe.recipe_type,recipe.serving_size?`Serves ${recipe.serving_size}`:null,recipe.prep_time?`Prep ${recipe.prep_time}`:null,recipe.cook_time?`Cook ${recipe.cook_time}`:null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{overflowY:'auto',flex:1}}>
            {recipe.description&&<p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>{recipe.description}</p>}
            {recipe.ingredients?.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:8}}>
                  Ingredients {costTotal>0&&<span style={{fontWeight:400}}>— est. cost <strong style={{color:'var(--text)'}}>${costTotal.toFixed(4)}</strong></span>}
                </div>
                <table style={{width:'100%',borderCollapse:'collapse'}}><tbody>
                  {recipe.ingredients.map(i=>{
                    const c=i.cost_per_gram&&i.amount&&i.measurement==='g'?parseFloat(i.cost_per_gram)*parseFloat(i.amount):null;
                    return (<tr key={i.id} style={{borderBottom:'1px solid var(--border)'}}>
                      <td style={{padding:'6px 8px 6px 0',fontSize:13}}>{i.ingredient}</td>
                      <td style={{padding:'6px 0',fontSize:13,color:'var(--text-muted)',textAlign:'right'}}>{i.amount?`${i.amount} ${i.measurement||''}`.trim():'—'}</td>
                      {c&&<td style={{padding:'6px 0 6px 12px',fontSize:11,color:'var(--text-muted)',fontFamily:'monospace',textAlign:'right'}}>${c.toFixed(4)}</td>}
                    </tr>);
                  })}
                </tbody></table>
              </div>
            )}
            {recipe.steps?.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:8}}>Steps</div>
                <ol style={{paddingLeft:20,margin:0}}>
                  {recipe.steps.map(s=>(
                    <li key={s.id} style={{fontSize:13,marginBottom:10,lineHeight:1.6}}>
                      {s.step_type==='fold'?(
                        <span><strong style={{color:'var(--accent2)'}}>Fold — {s.fold_type}</strong>
                          {s.step_time&&<span style={{color:'var(--text-muted)'}}> · {s.step_time}</span>}
                          {s.fold_interval&&<span style={{color:'var(--text-muted)'}}> · {s.fold_interval}</span>}
                          {(s.temp_min||s.temp_max)&&<span style={{color:'var(--text-muted)'}}> · {s.temp_min}°–{s.temp_max}°F</span>}
                          {s.step_description&&<span style={{color:'var(--text-muted)'}}> · {s.step_description}</span>}
                        </span>
                      ):(
                        <span>{s.step_description}
                          {s.step_time&&<span style={{color:'var(--text-muted)',fontSize:12}}> — {s.step_time}</span>}
                          {s.requires_notification&&<span style={{marginLeft:8,fontSize:11,color:'var(--accent2)'}}>⏰</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {(recipe.contains_label||recipe.ingredient_label)&&(
              <div style={{marginBottom:16}}>
                {recipe.ingredient_label&&<div style={{marginBottom:8}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>Ingredient Label</div><div style={{fontSize:12}}>{recipe.ingredient_label}</div></div>}
                {recipe.contains_label&&<div><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>Contains</div><div style={{fontSize:12}}>{recipe.contains_label}</div></div>}
              </div>
            )}
            {recipe.notes&&<div style={{marginBottom:16}}><div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>Notes</div><div style={{fontSize:13,whiteSpace:'pre-wrap'}}>{recipe.notes}</div></div>}
          </div>
          <div className="modal-actions" style={{marginTop:16}}>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
            <button className="btn btn-secondary" onClick={() => onMake(recipe)}>🍞 Make</button>
            <button className="btn btn-primary" onClick={() => onEdit(recipe)}>Edit</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────
function DeleteConfirm({ recipe, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="modal" style={{maxWidth:400}}>
        <div className="modal-title">Delete Recipe</div>
        <p style={{color:'var(--text-muted)',fontSize:14}}>Are you sure you want to delete <strong style={{color:'var(--text)'}}>{recipe.recipe_name}</strong>? This cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" disabled={deleting} onClick={async()=>{setDeleting(true);await onConfirm();}}>{deleting?'Deleting…':'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Recipes Page ──────────────────────────────────────────
export function RecipesPage() {
  const [recipes, setRecipes]               = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [typeFilter, setTypeFilter]         = useState('');
  const [stageFilter, setStageFilter]       = useState('');
  const [modal, setModal]                   = useState(null);
  const [makeRecipe, setMakeRecipe]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)      params.set('search', search);
      if (typeFilter)  params.set('type', typeFilter);
      if (stageFilter) params.set('stage', stageFilter);
      const [recs, ings] = await Promise.all([api.get(`/recipes?${params}`), api.get('/ingredients')]);
      setRecipes(recs); setAllIngredients(ings);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, typeFilter, stageFilter]);

  useEffect(() => { load(); }, [load]);

  const types = [...new Set(recipes.map(r=>r.recipe_type).filter(Boolean))].sort();

  async function handleSave(form, ingredients, steps) {
    let saved;
    if (modal.recipe?.id) { saved = await api.put(`/recipes/${modal.recipe.id}`, form); }
    else { saved = await api.post('/recipes', form); }
    await Promise.all([
      api.put(`/recipes/${saved.id}/ingredients`, { ingredients }),
      api.put(`/recipes/${saved.id}/steps`, { steps }),
    ]);
    setModal(null); load();
  }

  async function handleDelete() { await api.delete(`/recipes/${modal.recipe.id}`); setModal(null); load(); }

  async function openEdit(recipe) {
    const full = await api.get(`/recipes/${recipe.id}`);
    setModal({ mode:'edit', recipe: full });
  }

  async function handleDuplicate(recipe) {
    const full = await api.get(`/recipes/${recipe.id}`);
    setModal({ mode:'new', recipe:{ ...full, id:undefined, recipe_name:`Copy of ${full.recipe_name}`, square_id:'', woo_id:'' } });
  }

  async function openMake(recipe) {
    const full = await api.get(`/recipes/${recipe.id}`);
    setMakeRecipe(full);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📖 Recipes</div>
          <div className="page-subtitle">{recipes.length} recipe{recipes.length!==1?'s':''}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-secondary" onClick={()=>setModal({mode:'import'})}>↑ Import CSV</button>
          <button className="btn btn-primary" onClick={()=>setModal({mode:'new'})}>+ New Recipe</button>
        </div>
      </div>

      <div className="search-bar">
        <input style={{flex:1,maxWidth:320,background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:14}}
          placeholder="Search recipes…" value={search} onChange={e=>setSearch(e.target.value)} />
        {types.length>0&&(
          <select style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:14}}
            value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {types.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:6,padding:'8px 12px',color:'var(--text)',fontSize:14}}
          value={stageFilter} onChange={e=>setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
      </div>

      <div className="card" style={{padding:0}}>
        {loading ? <div className="loading">Loading…</div>
        : recipes.length===0 ? (
          <div className="empty-state">
            <div style={{fontSize:48}}>📖</div>
            <p>{search||typeFilter||stageFilter?'No recipes match your search.':'No recipes yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Recipe</th><th>Type</th><th>Stage</th><th>Serves</th><th>Prep</th><th>Cook</th><th></th></tr></thead>
              <tbody>
                {recipes.map(r=>(
                  <tr key={r.id}>
                    <td>
                      <div style={{fontWeight:600,cursor:'pointer',color:'var(--accent2)'}} onClick={()=>setModal({mode:'detail',recipe:r})}>{r.recipe_name}</div>
                      {r.recipe_by&&<div style={{fontSize:12,color:'var(--text-muted)'}}>by {r.recipe_by}</div>}
                    </td>
                    <td style={{color:'var(--text-muted)'}}>{r.recipe_type||'—'}</td>
                    <td><span className={`badge ${STAGE_BADGE[r.stage]||'badge-gray'}`}>{r.stage||'production'}</span></td>
                    <td style={{color:'var(--text-muted)'}}>{r.serving_size||'—'}</td>
                    <td style={{color:'var(--text-muted)'}}>{r.prep_time||'—'}</td>
                    <td style={{color:'var(--text-muted)'}}>{r.cook_time||'—'}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-secondary btn-sm" title="Make" onClick={()=>openMake(r)}>🍞</button>
                        <button className="btn btn-secondary btn-sm" onClick={()=>openEdit(r)}>Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={()=>handleDuplicate(r)}>Dupe</button>
                        <button className="btn btn-danger btn-sm" onClick={()=>setModal({mode:'delete',recipe:r})}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode==='detail' && (
        <RecipeDetail recipe={modal.recipe}
          onEdit={r=>setModal({mode:'edit',recipe:r})}
          onMake={r=>{ setModal(null); setMakeRecipe(r); }}
          onClose={()=>setModal(null)} />
      )}
      {(modal?.mode==='new'||modal?.mode==='edit') && (
        <RecipeForm initial={modal.recipe} allIngredients={allIngredients} onSave={handleSave} onCancel={()=>setModal(null)} />
      )}
      {modal?.mode==='delete' && (
        <DeleteConfirm recipe={modal.recipe} onConfirm={handleDelete} onCancel={()=>setModal(null)} />
      )}
      {modal?.mode==='import' && (
        <RecipesImportModal existingNames={new Set(recipes.map(r=>r.recipe_name.toLowerCase()))} onClose={()=>setModal(null)} onDone={load} />
      )}
      {makeRecipe && (
        <MakeView recipe={makeRecipe} onClose={()=>setMakeRecipe(null)} />
      )}
    </div>
  );
}