import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

const MEASUREMENTS = ['g','kg','ml','L','tsp','tbsp','cup','oz','lb','pinch','piece','slice','clove','sprig','bunch'];
const OUTCOMES = [
  { value: 'pending',    label: 'Pending',      color: 'var(--text-muted)' },
  { value: 'success',    label: 'Success',      color: 'var(--accent)' },
  { value: 'needs_work', label: 'Needs Work',   color: '#f59e0b' },
  { value: 'fail',       label: 'Fail',         color: 'var(--danger)' },
];
const EMPTY_STEP = { step_number: 1, step_type: 'regular', step_description: '', step_time: '',
  requires_notification: false, fold_type: '', fold_interval: '', temp_min: '', temp_max: '' };
const EMPTY_ING = { ingredient_id: '', ingredient: '', amount: '', measurement: '' };

function outcomeColor(v) { return OUTCOMES.find(o => o.value === v)?.color || 'var(--text-muted)'; }
function outcomeLabel(v) { return OUTCOMES.find(o => o.value === v)?.label || 'Pending'; }

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(null);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onChange(value === n ? null : n)}
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '0 1px',
            color: n <= (hover ?? value ?? 0) ? '#f59e0b' : 'var(--border)' }}>
          ★
        </button>
      ))}
    </div>
  );
}

// ── Step Row (mirrors RecipesPage StepRow) ─────────────────
function StepRow({ step, idx, total, onChange, onRemove, onMove }) {
  const isFold = step.step_type === 'fold';
  return (
    <div style={{ background: 'var(--surface2)', border: `1px solid ${isFold ? 'var(--accent2)' : 'var(--border)'}`, borderRadius: 6, padding: 10, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', minWidth: 24 }}>{step.step_number}.</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['regular','fold'].map(t => (
            <button key={t} onClick={() => onChange('step_type', t)} style={{
              padding: '3px 10px', fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: 'pointer', border: '1px solid var(--border)',
              background: step.step_type === t ? 'var(--accent2)' : 'var(--surface)',
              color: step.step_type === t ? '#fff' : 'var(--text-muted)',
            }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          <button onClick={() => onMove(-1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↑</button>
          <button onClick={() => onMove(1)} disabled={idx === total-1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↓</button>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red,#e55)', padding: '2px 4px' }}>✕</button>
        </div>
      </div>
      {isFold ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Fold Type</label>
            <select value={step.fold_type||''} onChange={e => onChange('fold_type', e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}>
              <option value="">— Select —</option>
              {['Stretch & Fold','Coil','Lamination'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Total Duration</label>
            <input value={step.step_time||''} onChange={e => onChange('step_time', e.target.value)} placeholder="e.g. 3 hours"
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Interval</label>
            <input value={step.fold_interval||''} onChange={e => onChange('fold_interval', e.target.value)} placeholder="e.g. every 30 min"
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Temp Range (°F)</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" value={step.temp_min||''} onChange={e => onChange('temp_min', e.target.value)} placeholder="Min"
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>–</span>
              <input type="number" value={step.temp_max||''} onChange={e => onChange('temp_max', e.target.value)} placeholder="Max"
                style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }} />
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Notes (optional)</label>
            <input value={step.step_description||''} onChange={e => onChange('step_description', e.target.value)} placeholder="Any additional fold notes..."
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>
      ) : (
        <div>
          <textarea value={step.step_description||''} onChange={e => onChange('step_description', e.target.value)} placeholder="Describe this step..."
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 56, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center' }}>
            <input placeholder="Time (e.g. 30 min)" value={step.step_time||''} onChange={e => onChange('step_time', e.target.value)}
              style={{ width: 140, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!step.requires_notification} onChange={e => onChange('requires_notification', e.target.checked)} style={{ width: 'auto' }} />
              Notify
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Snapshot Editor (steps + ingredients for a single test) ─
function SnapshotEditor({ test, allIngredients, onClose, onSaved }) {
  const [tab, setTab]               = useState('ingredients');
  const [ingredients, setIngredients] = useState(test.ingredients || []);
  const [steps, setSteps]           = useState(test.steps || []);
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

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
  function removeIng(idx) { setIngredients(i => i.filter((_,j) => j !== idx).map((x,j) => ({ ...x, sort_order: j }))); }
  function moveIng(idx, dir) {
    setIngredients(i => {
      const n = [...i], s = idx + dir;
      if (s < 0 || s >= n.length) return i;
      [n[idx], n[s]] = [n[s], n[idx]];
      return n.map((x, j) => ({ ...x, sort_order: j }));
    });
  }
  function addStep() { setSteps(s => [...s, { ...EMPTY_STEP, step_number: s.length + 1 }]); }
  function setStep(idx, k, v) { setSteps(s => s.map((x, i) => i === idx ? { ...x, [k]: v } : x)); }
  function removeStep(idx) { setSteps(s => s.filter((_, i) => i !== idx).map((x, i) => ({ ...x, step_number: i + 1 }))); }
  function moveStep(idx, dir) {
    setSteps(s => {
      const n = [...s], sw = idx + dir;
      if (sw < 0 || sw >= n.length) return s;
      [n[idx], n[sw]] = [n[sw], n[idx]];
      return n.map((x, i) => ({ ...x, step_number: i + 1 }));
    });
  }

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      const [newIngs, newSteps] = await Promise.all([
        api.put(`/recipes/${test.recipe_id}/tests/${test.id}/ingredients`, { ingredients }),
        api.put(`/recipes/${test.recipe_id}/tests/${test.id}/steps`, { steps }),
      ]);
      onSaved({ ...test, ingredients: newIngs, steps: newSteps });
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const tabStyle = t => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderBottom: tab === t ? '2px solid var(--accent2)' : '2px solid transparent',
    background: 'none', color: tab === t ? 'var(--accent2)' : 'var(--text-muted)',
  });

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 740, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">Test #{test.test_number} — Snapshot</div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 4 }}>
          <button style={tabStyle('ingredients')} onClick={() => setTab('ingredients')}>Ingredients {ingredients.length > 0 && `(${ingredients.length})`}</button>
          <button style={tabStyle('steps')} onClick={() => setTab('steps')}>Steps {steps.length > 0 && `(${steps.length})`}</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {tab === 'ingredients' && (
            <div>
              {ingredients.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>No ingredients yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead><tr>
                    {['Ingredient','Amount','Unit',''].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '4px 8px 8px 0', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {ingredients.map((ing, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '4px 8px 4px 0', minWidth: 180 }}>
                          <select value={ing.ingredient_id||''} onChange={e => setIng(idx, 'ingredient_id', e.target.value)}
                            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: ing.ingredient_id ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>
                            <option value="">— Select ingredient —</option>
                            {allIngredients.map(a => <option key={a.id} value={a.id}>{a.item_name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px 4px 0', width: 90 }}>
                          <input type="number" step="0.0001" value={ing.amount||''} onChange={e => setIng(idx, 'amount', e.target.value)}
                            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }} />
                        </td>
                        <td style={{ padding: '4px 8px 4px 0', width: 90 }}>
                          <select value={ing.measurement||''} onChange={e => setIng(idx, 'measurement', e.target.value)}
                            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 }}>
                            <option value="">—</option>
                            {MEASUREMENTS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 0', whiteSpace: 'nowrap' }}>
                          <button onClick={() => moveIng(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↑</button>
                          <button onClick={() => moveIng(idx, 1)} disabled={idx === ingredients.length-1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>↓</button>
                          <button onClick={() => removeIng(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red,#e55)', padding: '2px 4px' }}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button className="btn btn-secondary btn-sm" onClick={addIngredient}>+ Add Ingredient</button>
            </div>
          )}
          {tab === 'steps' && (
            <div>
              {steps.map((step, idx) => (
                <StepRow key={idx} step={step} idx={idx} total={steps.length}
                  onChange={(k, v) => setStep(idx, k, v)}
                  onRemove={() => removeStep(idx)}
                  onMove={dir => moveStep(idx, dir)} />
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addStep}>+ Add Step</button>
            </div>
          )}
        </div>
        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Snapshot'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Test Card ──────────────────────────────────────────────
function TestCard({ test, allIngredients, onUpdate, onDelete, onPromote, onSnapshotSaved }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({
    label:        test.label || '',
    stage:        test.stage || 'testing',
    tested_at:    test.tested_at ? test.tested_at.slice(0,10) : '',
    outcome:      test.outcome || 'pending',
    rating:       test.rating || null,
    tasting_notes: test.tasting_notes || '',
    crumb_notes:  test.crumb_notes || '',
    crust_notes:  test.crust_notes || '',
    observations: test.observations || '',
  });
  const [saving, setSaving]     = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [confirmPromote, setConfirmPromote] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await onUpdate(test.id, form);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setForm({
      label: test.label || '', stage: test.stage || 'testing',
      tested_at: test.tested_at ? test.tested_at.slice(0,10) : '',
      outcome: test.outcome || 'pending', rating: test.rating || null,
      tasting_notes: test.tasting_notes || '', crumb_notes: test.crumb_notes || '',
      crust_notes: test.crust_notes || '', observations: test.observations || '',
    });
    setEditing(false);
  }

  const fieldStyle = { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };

  return (
    <div style={{ border: `1px solid ${test.is_promoted ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, marginBottom: 12, background: 'var(--surface2)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
        onClick={() => { setExpanded(e => !e); }}>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 72 }}>Test #{test.test_number}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{test.tested_at ? new Date(test.tested_at).toLocaleDateString() : '—'}</div>
        {test.label && <div style={{ fontSize: 13, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{test.label}</div>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          {test.is_promoted && (
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'var(--accent)', color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Promoted</span>
          )}
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
            background: `${outcomeColor(test.outcome)}22`, color: outcomeColor(test.outcome) }}>
            {outcomeLabel(test.outcome)}
          </span>
          {test.rating && <span style={{ fontSize: 13, color: '#f59e0b' }}>{'★'.repeat(test.rating)}{'☆'.repeat(5 - test.rating)}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {!editing ? (
            <>
              {/* Read view */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {[
                  { label: 'Tasting Notes', val: test.tasting_notes },
                  { label: 'Crumb Notes',   val: test.crumb_notes },
                  { label: 'Crust Notes',   val: test.crust_notes },
                  { label: 'Observations',  val: test.observations },
                ].map(({ label, val }) => val ? (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{val}</div>
                  </div>
                ) : null)}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSnapshot(true)}>
                  View / Edit Snapshot ({test.ingredients.length} ing, {test.steps.length} steps)
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit Notes</button>
                {!test.is_promoted && (
                  confirmPromote ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Promote this test to the canonical recipe?</span>
                      <button className="btn btn-primary btn-sm" onClick={() => { setConfirmPromote(false); onPromote(test.id); }}>Yes, Promote</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setConfirmPromote(false)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => setConfirmPromote(true)}>⬆ Promote to Recipe</button>
                  )
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => onDelete(test.id)}
                  style={{ marginLeft: 'auto', color: 'var(--danger)' }}>Delete</button>
              </div>
            </>
          ) : (
            <>
              {/* Edit view */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Label</label>
                  <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Higher hydration attempt" style={fieldStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Date</label>
                  <input type="date" value={form.tested_at} onChange={e => set('tested_at', e.target.value)} style={fieldStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Outcome</label>
                  <select value={form.outcome} onChange={e => set('outcome', e.target.value)} style={fieldStyle}>
                    {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Rating</label>
                  <StarRating value={form.rating} onChange={v => set('rating', v)} />
                </div>
                {[
                  { key: 'tasting_notes', label: 'Tasting Notes' },
                  { key: 'crumb_notes',   label: 'Crumb Notes' },
                  { key: 'crust_notes',   label: 'Crust Notes' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>{label}</label>
                    <textarea value={form[key]} onChange={e => set(key, e.target.value)} rows={2}
                      style={{ ...fieldStyle, resize: 'vertical' }} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Observations</label>
                  <textarea value={form.observations} onChange={e => set('observations', e.target.value)} rows={3}
                    placeholder="What changed, what you noticed, what to try next..." style={{ ...fieldStyle, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </>
          )}
        </div>
      )}

      {showSnapshot && (
        <SnapshotEditor
          test={test}
          allIngredients={allIngredients}
          onClose={() => setShowSnapshot(false)}
          onSaved={updated => { onSnapshotSaved(updated); setShowSnapshot(false); }}
        />
      )}
    </div>
  );
}

// ── New Test Form ──────────────────────────────────────────
function NewTestForm({ onSubmit, onCancel }) {
  const [label, setLabel]         = useState('');
  const [testedAt, setTestedAt]   = useState(new Date().toISOString().slice(0,10));
  const [saving, setSaving]       = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try { await onSubmit({ label, tested_at: testedAt }); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>New Test</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Higher hydration attempt"
            style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date</label>
          <input type="date" value={testedAt} onChange={e => setTestedAt(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', color: 'var(--text)', fontSize: 13 }} />
        </div>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Creating…' : 'Create & Snapshot'}</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Snapshots current recipe ingredients and steps into this test.
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────
export function RecipeTestLogModal({ recipe, onClose, onPromoted }) {
  const [tests, setTests]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [allIngredients, setAllIngredients] = useState([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [err, setErr]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [testsData, ingsData] = await Promise.all([
        api.get(`/recipes/${recipe.id}/tests`),
        api.get('/ingredients'),
      ]);
      setTests(testsData);
      setAllIngredients(ingsData);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [recipe.id]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(data) {
    try {
      const newTest = await api.post(`/recipes/${recipe.id}/tests`, data);
      setTests(t => [newTest, ...t]);
      setShowNewForm(false);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleUpdate(testId, data) {
    try {
      const updated = await api.put(`/recipes/${recipe.id}/tests/${testId}`, data);
      setTests(t => t.map(x => x.id === testId ? { ...x, ...updated } : x));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleDelete(testId) {
    if (!confirm('Delete this test? This cannot be undone.')) return;
    try {
      await api.delete(`/recipes/${recipe.id}/tests/${testId}`);
      setTests(t => t.filter(x => x.id !== testId));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handlePromote(testId) {
    try {
      await api.post(`/recipes/${recipe.id}/tests/${testId}/promote`);
      setTests(t => t.map(x => ({ ...x, is_promoted: x.id === testId })));
      onPromoted?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  function handleSnapshotSaved(updated) {
    setTests(t => t.map(x => x.id === updated.id ? updated : x));
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 2 }}>Test Log</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{recipe.recipe_name}</div>
          </div>
          {!showNewForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(true)}>+ New Test</button>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {showNewForm && (
            <NewTestForm onSubmit={handleCreate} onCancel={() => setShowNewForm(false)} />
          )}

          {loading ? (
            <div className="loading">Loading…</div>
          ) : tests.length === 0 && !showNewForm ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧪</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No tests yet</div>
              <div style={{ fontSize: 13 }}>Create a test to snapshot the current recipe state and start tracking iterations.</div>
            </div>
          ) : (
            tests.map(test => (
              <TestCard
                key={test.id}
                test={test}
                allIngredients={allIngredients}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onPromote={handlePromote}
                onSnapshotSaved={handleSnapshotSaved}
              />
            ))
          )}
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
