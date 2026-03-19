import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { SearchInput } from '../components/SearchInput.jsx';

const PRESETS = [
  { label: '¼x',  value: 0.25 },
  { label: '½x',  value: 0.5  },
  { label: '¾x',  value: 0.75 },
  { label: '1x',  value: 1    },
  { label: '1½x', value: 1.5  },
  { label: '2x',  value: 2    },
  { label: '3x',  value: 3    },
];

const FOLD_TYPES = ['S&F', 'Coil', 'Lamination'];

function scaleAmount(amount, multiplier) {
  if (!amount) return null;
  const n = parseFloat(amount) * multiplier;
  // Clean up floating point noise
  return parseFloat(n.toPrecision(6));
}

function fmtAmount(amount, multiplier) {
  const scaled = scaleAmount(amount, multiplier);
  if (scaled === null) return '';
  // Show up to 1 decimal for cleanliness
  return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ── Fold Row ──────────────────────────────────────────────
function FoldRow({ fold, onUpdate, onRemove }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr 100px 110px 36px',
      gap: 8,
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
        {fold.number}
      </div>
      <select
        value={fold.type}
        onChange={e => onUpdate('type', e.target.value)}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 13 }}
      >
        <option value="">— Type —</option>
        {FOLD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        type="number"
        step="0.1"
        placeholder="Temp °F"
        value={fold.temp}
        onChange={e => onUpdate('temp', e.target.value)}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 13, width: '100%' }}
      />
      <button
        onClick={() => onUpdate('time', fold.time ? null : Date.now())}
        style={{
          background: fold.time ? 'var(--accent)' : 'var(--surface2)',
          border: `1px solid ${fold.time ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6,
          padding: '6px 8px',
          color: fold.time ? '#fff' : 'var(--text-muted)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {fold.time ? fmtTime(fold.time) : '⏱ Done'}
      </button>
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '4px' }}
      >✕</button>
    </div>
  );
}

// ── Make View ─────────────────────────────────────────────
function MakeView({ recipe, onBack }) {
  const [multiplier, setMultiplier]   = useState(1);
  const [customYield, setCustomYield] = useState('');
  const [folds, setFolds]             = useState([]);
  const [nextFoldNum, setNextFoldNum] = useState(1);

  const servingSize = parseFloat(recipe.serving_size) || 1;
  const hasFolds    = recipe.steps?.some(s => s.step_type === 'fold');

  function applyPreset(val) {
    setMultiplier(val);
    setCustomYield('');
  }

  function handleCustomYield(val) {
    setCustomYield(val);
    const n = parseFloat(val);
    if (n > 0 && servingSize > 0) {
      setMultiplier(n / servingSize);
    }
  }

  function addFolds(count) {
    const newFolds = [];
    for (let i = 0; i < count; i++) {
      newFolds.push({ id: Date.now() + i, number: nextFoldNum + i, type: '', temp: '', time: null });
    }
    setFolds(f => [...f, ...newFolds]);
    setNextFoldNum(n => n + count);
  }

  function updateFold(id, key, val) {
    setFolds(f => f.map(fold => fold.id === id ? { ...fold, [key]: val } : fold));
  }

  function removeFold(id) {
    setFolds(f => {
      const filtered = f.filter(fold => fold.id !== id);
      // Renumber
      return filtered.map((fold, i) => ({ ...fold, number: i + 1 }));
    });
    setNextFoldNum(folds.length); // after removal
  }

  const scaledYield = Math.round(servingSize * multiplier * 10) / 10;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            ← Back
          </button>
          <div className="page-title">🍞 {recipe.recipe_name}</div>
          <div className="page-subtitle">
            {[recipe.recipe_type, recipe.prep_time ? `Prep ${recipe.prep_time}` : null, recipe.cook_time ? `Cook ${recipe.cook_time}` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* Multiplier controls */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>Batch Size</div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {PRESETS.map(p => (
            <button
              key={p.value}
              onClick={() => applyPreset(p.value)}
              style={{
                padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: multiplier === p.value && !customYield ? 'var(--accent2)' : 'var(--surface2)',
                color: multiplier === p.value && !customYield ? '#fff' : 'var(--text)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom yield */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>I need</span>
          <input
            type="number"
            min="0.1"
            step="1"
            value={customYield}
            onChange={e => handleCustomYield(e.target.value)}
            placeholder={String(servingSize)}
            style={{
              width: 80, background: 'var(--surface2)', border: `1px solid ${customYield ? 'var(--accent2)' : 'var(--border)'}`,
              borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 14, fontWeight: 600,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {recipe.recipe_type ? recipe.recipe_type.toLowerCase() : 'units'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
            Multiplier: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
              {multiplier % 1 === 0 ? multiplier : multiplier.toFixed(3)}x
            </strong>
            {recipe.serving_size && (
              <span style={{ marginLeft: 10 }}>
                → <strong style={{ color: 'var(--accent2)' }}>{scaledYield}</strong> {recipe.recipe_type?.toLowerCase() || 'units'}
              </span>
            )}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* Ingredients */}
        {recipe.ingredients?.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
              Ingredients
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {recipe.ingredients.map(ing => {
                  const scaled = fmtAmount(ing.amount, multiplier);
                  return (
                    <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: 14 }}>{ing.ingredient}</td>
                      <td style={{ padding: '8px 0', fontSize: 14, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {scaled ? (
                          <span>
                            <strong style={{ color: 'var(--accent2)', fontFamily: 'monospace' }}>{scaled}</strong>
                            {ing.measurement && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{ing.measurement}</span>}
                          </span>
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
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
              Steps
            </div>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              {recipe.steps.map(s => (
                <li key={s.id} style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.7 }}>
                  {s.step_type === 'fold' ? (
                    <span>
                      <strong style={{ color: 'var(--accent2)' }}>Fold</strong>
                      {s.fold_type && <span style={{ color: 'var(--text-muted)' }}> — {s.fold_type}</span>}
                      {s.step_time && <span style={{ color: 'var(--text-muted)' }}> · {s.step_time}</span>}
                      {s.fold_interval && <span style={{ color: 'var(--text-muted)' }}> · every {s.fold_interval}</span>}
                      {(s.temp_min || s.temp_max) && (
                        <span style={{ color: 'var(--text-muted)' }}> · {s.temp_min}°–{s.temp_max}°F</span>
                      )}
                      {s.step_description && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{s.step_description}</div>}
                    </span>
                  ) : (
                    <span>
                      {s.step_description}
                      {s.step_time && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> — {s.step_time}</span>}
                      {s.requires_notification && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent2)' }}>⏰</span>}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Fold tracking — only shown if recipe has fold steps */}
      {hasFolds && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Fold Tracking
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Add</span>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => addFolds(n)}
                  style={{
                    width: 32, height: 32, borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--text)', fontSize: 13,
                    fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {folds.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
              No folds logged yet — tap a number above to add fold rows.
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 100px 110px 36px',
                gap: 8,
                padding: '0 0 6px 0',
                borderBottom: '2px solid var(--border)',
              }}>
                {['#', 'Type', 'Temp °F', 'Time', ''].map(h => (
                  <div key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</div>
                ))}
              </div>
              {folds.map(fold => (
                <FoldRow
                  key={fold.id}
                  fold={fold}
                  onUpdate={(key, val) => updateFold(fold.id, key, val)}
                  onRemove={() => removeFold(fold.id)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Notes */}
      {recipe.notes && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{recipe.notes}</div>
        </div>
      )}
    </div>
  );
}

// ── Make Page ─────────────────────────────────────────────
export function MakePage() {
  const [recipes, setRecipes]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)     params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      // Only show production recipes by default
      params.set('stage', 'production');
      const data = await api.get(`/recipes?${params}`);
      setRecipes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleSelect(recipe) {
    setLoadingRecipe(true);
    try {
      const full = await api.get(`/recipes/${recipe.id}`);
      setSelected(full);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRecipe(false);
    }
  }

  const types = [...new Set(recipes.map(r => r.recipe_type).filter(Boolean))].sort();

  if (selected) {
    return <MakeView recipe={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🍞 Make a Recipe</div>
          <div className="page-subtitle">Select a recipe to get started</div>
        </div>
      </div>

      <div className="search-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search recipes…" />
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
        {loadingRecipe ? (
          <div className="loading">Loading recipe…</div>
        ) : loading ? (
          <div className="loading">Loading…</div>
        ) : recipes.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🍞</div>
            <p>{search || typeFilter ? 'No recipes match your search.' : 'No production recipes yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Type</th>
                  <th>Yield</th>
                  <th>Prep</th>
                  <th>Cook</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recipes.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => handleSelect(r)}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--accent2)' }}>{r.recipe_name}</div>
                      {r.recipe_by && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {r.recipe_by}</div>}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.recipe_type || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.serving_size || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.prep_time || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.cook_time || '—'}</td>
                    <td>
                      <button className="btn btn-primary btn-sm">Make →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
