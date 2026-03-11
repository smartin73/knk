import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { api } from '../lib/api.js';

const STEPS = ['Upload', 'Preview', 'Done'];

function parseBool(val) {
  if (!val) return false;
  return ['true', 'yes', '1'].includes(String(val).trim().toLowerCase());
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

export function ItemBuilderImportModal({ existingNames, onClose, onDone }) {
  const [step, setStep]         = useState(0);
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null); // { toImport, dupes, invalid }
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [err, setErr]           = useState('');
  const fileRef = useRef();

  async function handlePreview() {
    if (!file) return setErr('Please upload a CSV file.');
    setErr('');
    try {
      const rows = await parseCsv(file);
      const toImport = [], dupes = [], invalid = [];

      for (const r of rows) {
        const name = (r.item_name || '').trim();
        if (!name) { invalid.push({ ...r, _reason: 'Missing item_name' }); continue; }
        if (existingNames.has(name.toLowerCase())) { dupes.push(name); continue; }

        toImport.push({
          item_name:          name,
          description:        r.description || null,
          batch_qty:          r.batch_qty ? parseFloat(r.batch_qty) : 1,
          retail_price:       r.retail_price ? parseFloat(r.retail_price) : null,
          include_packaging:  parseBool(r.include_packaging),
          packaging_cost:     r.packaging_cost ? parseFloat(r.packaging_cost) : null,
          include_fees:       parseBool(r.include_fees),
          square_fee:         r.square_fee ? parseFloat(r.square_fee) : null,
          square_fee_online:  r.square_fee_online ? parseFloat(r.square_fee_online) : null,
          food_cook_time:     r.food_cook_time || null,
          ingredient_label:   r.ingredient_label || null,
          contains_label:     r.contains_label || null,
          image_url:          r.image_url || null,
          square_id:          r.square_id || null,
          woo_id:             r.woo_id || null,
        });
      }

      setPreview({ toImport, dupes, invalid });
      setStep(1);
    } catch (e) {
      setErr('Error parsing CSV: ' + e.message);
    }
  }

  async function handleImport() {
    setImporting(true); setErr('');
    try {
      const res = await api.post('/items/import', { items: preview.toImport });
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
        <div className="modal-title">Import Items</div>
        <StepIndicator current={step} />

        {/* ── Step 0: Upload ── */}
        {step === 0 && (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Upload a CSV with these columns:
              <code style={{ display: 'block', marginTop: 8, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12, color: 'var(--text)' }}>
                item_name, description, batch_qty, retail_price, include_packaging,
                packaging_cost, include_fees, square_fee, square_fee_online,
                food_cook_time, ingredient_label, contains_label, square_id, woo_id
              </code>
              <span style={{ fontSize: 12, marginTop: 6, display: 'block' }}>Only <strong>item_name</strong> is required. Boolean fields accept true/false or yes/no.</span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: file ? 'var(--surface2)' : undefined }}
                onClick={() => fileRef.current.click()}
              >
                {file
                  ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓ {file.name}</span>
                  : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Click to upload items CSV</span>
                }
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => { setFile(e.target.files[0]); e.target.value = ''; }} />
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
                    {['Item', 'Retail', 'Batch Qty', 'Status'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.toImport.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)', background: 'rgba(34,197,94,0.04)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.item_name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.retail_price != null ? `$${r.retail_price.toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.batch_qty}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ color: 'var(--accent)', fontSize: 12 }}>Ready</span></td>
                    </tr>
                  ))}
                  {preview.dupes.map((name, i) => (
                    <tr key={`dupe-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(245,158,11,0.06)' }}>
                      <td style={{ padding: '8px 12px', color: '#f59e0b' }}>{name}</td>
                      <td colSpan={2} />
                      <td style={{ padding: '8px 12px' }}><span style={{ color: '#f59e0b', fontSize: 12 }}>Duplicate</span></td>
                    </tr>
                  ))}
                  {preview.invalid.map((r, i) => (
                    <tr key={`inv-${i}`} style={{ borderTop: '1px solid var(--border)', background: 'rgba(239,68,68,0.06)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--danger)' }}>{r.item_name || '(blank)'}</td>
                      <td colSpan={2} />
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
                {importing ? 'Importing…' : `Import ${preview.toImport.length} Item${preview.toImport.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Done ── */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {imported} item{imported !== 1 ? 's' : ''} imported
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
              Components can be linked from the item edit form.
            </div>
            <button className="btn btn-primary" onClick={() => { onDone(); onClose(); }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
