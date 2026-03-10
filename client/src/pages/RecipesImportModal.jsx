import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { api } from '../lib/api.js';

const STEPS = ['Upload', 'Preview', 'Done'];

// Convert FileMaker duration "10h 30m 0s 0ms" → "10:30"
function fmDuration(val) {
  if (!val) return null;
  const val2 = String(val).trim();
  const fm = val2.match(/^(\d+)h\s+(\d+)m/);
  if (fm) {
    const h = parseInt(fm[1]);
    const m = parseInt(fm[2]);
    // If looks like a time (h < 24), return HH:MM, else return raw string for notes
    if (h < 24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    // Long durations like "16 hours" — return human readable
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : null;
  }
  // Already a plain string like "16 hours" or "48 minutes"
  return val2 || null;
}

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => resolve(r.data),
      error: reject,
    });
  });
}

function StepIndicator({ current }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i < current ? 'var(--accent)' : i === current ? 'var(--accent2)' : 'var(--surface2)',
              color: i <= current ? '#fff' : 'var(--text-muted)',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 13, color: i === current ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === current ? 600 : 400 }}>
              {s}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ width: 32, height: 1, background: 'var(--border)', margin: '0 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function RecipesImportModal({ existingNames, onClose, onDone }) {
  const [step, setStep]           = useState(0);
  const [recipesFile, setRecipesFile] = useState(null);
  const [stepsFile, setStepsFile]     = useState(null);
  const [preview, setPreview]     = useState(null); // { toImport, dupes, invalid }
  const [importing, setImporting] = useState(false);
  const [imported, setImported]   = useState(0);
  const [err, setErr]             = useState('');
  const recipesRef = useRef();
  const stepsRef   = useRef();

  async function handlePreview() {
    if (!recipesFile) return setErr('Please upload the Recipes CSV.');
    setErr('');
    try {
      const recipeRows = await parseCsv(recipesFile);
      const stepRows   = stepsFile ? await parseCsv(stepsFile) : [];

      // Build step lookup: recipe_fk_uuid → steps[]
      const stepsByRecipe = {};
      for (const s of stepRows) {
        const fk = s.recipe_fk_uuid;
        if (!fk) continue;
        if (!stepsByRecipe[fk]) stepsByRecipe[fk] = [];
        stepsByRecipe[fk].push({
          step_number:           parseInt(s.StepNumber) || 1,
          step_description:      s.Steps || s.Steps_Print || '',
          step_time:             fmDuration(s.StepTime),
          requires_notification: s.StepsRequireNotification === 'Yes',
          step_type:             'regular',
        });
      }

      const toImport = [];
      const dupes    = [];
      const invalid  = [];

      for (const r of recipeRows) {
        const name = (r.recipeName || '').trim();
        if (!name) { invalid.push({ ...r, _reason: 'Missing recipe name' }); continue; }

        if (existingNames.has(name.toLowerCase())) {
          dupes.push(name);
          continue;
        }

        const uuid = r.recipes_pk_uuid;
        toImport.push({
          recipe_name:       name,
          recipe_by:         r.recipeBy || null,
          recipe_type:       r.recipeType || null,
          description:       r.recipeDescription || null,
          serving_size:      r.recipeServingSize || null,
          prep_time:         r.recipePrepTime || null,
          cook_time:         r.recipeCookTime || null,
          ingredient_label:  r.IngredientLabel || null,
          contains_label:    r.ContainsLabel || null,
          square_id:         r.receipeSquareId || null,
          woo_id:            r.receipeWooId || null,
          notes:             null,
          is_active:         true,
          steps:             (stepsByRecipe[uuid] || []).sort((a, b) => a.step_number - b.step_number),
        });
      }

      setPreview({ toImport, dupes, invalid });
      setStep(1);
    } catch (e) {
      setErr('Error parsing CSV: ' + e.message);
    }
  }

  async function handleImport() {
    setImporting(true);
    setErr('');
    try {
      const res = await api.post('/recipes/import', { recipes: preview.toImport });
      if (res.ok === false) throw new Error(res.error || 'Import failed');
      setImported(preview.toImport.length);
      setStep(2);
    } catch (e) {
      setErr(e.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-title">Import Recipes</div>
        <StepIndicator current={step} />

        {/* ── Step 0: Upload ── */}
        {step === 0 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                Recipes CSV <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: recipesFile ? 'var(--surface2)' : undefined }}
                onClick={() => recipesRef.current.click()}
              >
                {recipesFile
                  ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {recipesFile.name}</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Click to upload recipes CSV</span>
                }
              </div>
              <input ref={recipesRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { setRecipesFile(e.target.files[0]); e.target.value = ''; }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                Steps CSV <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
              </label>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: stepsFile ? 'var(--surface2)' : undefined }}
                onClick={() => stepsRef.current.click()}
              >
                {stepsFile
                  ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {stepsFile.name}</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Click to upload steps CSV (optional)</span>
                }
              </div>
              <input ref={stepsRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { setStepsFile(e.target.files[0]); e.target.value = ''; }} />
            </div>

            {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePreview}>Preview →</button>
            </div>
          </div>
        )}

        {/* ── Step 1: Preview ── */}
        {step === 1 && preview && (
          <div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 13 }}>
              <span style={{ color: 'var(--accent)' }}>✓ {preview.toImport.length} will import</span>
              {preview.dupes.length > 0 && <span style={{ color: '#f59e0b' }}>⚠ {preview.dupes.length} duplicate{preview.dupes.length !== 1 ? 's' : ''} (will skip)</span>}
              {preview.invalid.length > 0 && <span style={{ color: 'var(--danger)' }}>✕ {preview.invalid.length} invalid (will skip)</span>}
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Recipe</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>By</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Type</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Steps</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.toImport.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', background: 'rgba(34,197,94,0.04)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.recipe_name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.recipe_by || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.recipe_type || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.steps.length}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ color: 'var(--accent)', fontSize: 12 }}>Ready</span></td>
                    </tr>
                  ))}
                  {preview.dupes.map((name, i) => (
                    <tr key={`dupe-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.06)' }}>
                      <td style={{ padding: '8px 12px', color: '#f59e0b' }}>{name}</td>
                      <td colSpan={3} />
                      <td style={{ padding: '8px 12px' }}><span style={{ color: '#f59e0b', fontSize: 12 }}>Duplicate</span></td>
                    </tr>
                  ))}
                  {preview.invalid.map((r, i) => (
                    <tr key={`inv-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.06)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--danger)' }}>{r.recipeName || '(blank)'}</td>
                      <td colSpan={3} />
                      <td style={{ padding: '8px 12px' }}><span style={{ color: 'var(--danger)', fontSize: 12 }}>{r._reason}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || preview.toImport.length === 0}>
                {importing ? 'Importing…' : `Import ${preview.toImport.length} Recipe${preview.toImport.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Done ── */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {imported} recipe{imported !== 1 ? 's' : ''} imported
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              Steps have been linked to each recipe.
            </div>
            <button className="btn btn-primary" onClick={() => { onDone(); onClose(); }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
