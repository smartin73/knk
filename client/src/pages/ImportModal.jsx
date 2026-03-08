import { useState, useRef } from 'react';

// ── CSV Parser ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = fields[i] || ''; });
    return row;
  }).filter(row => Object.values(row).some(v => v !== ''));
  return { headers, rows };
}

// Auto-map CSV headers to schema fields using fuzzy matching
function autoMap(csvHeaders, fields) {
  const mapping = {};
  fields.forEach(f => {
    const key = f.key.toLowerCase().replace(/_/g, '');
    const label = f.label.toLowerCase().replace(/\s/g, '');
    const match = csvHeaders.find(h => {
      const hClean = h.toLowerCase().replace(/[\s_]/g, '');
      return hClean === key || hClean === label ||
        hClean.includes(key) || key.includes(hClean);
    });
    mapping[f.key] = match || '';
  });
  return mapping;
}

// ── ImportModal ───────────────────────────────────────────
// Props:
//   title        — e.g. "Import Ingredients"
//   fields       — [{ key, label, required }]
//   nameKey      — field key used to detect duplicates (e.g. 'item_name')
//   existingNames — Set of existing names (lowercase) for dupe detection
//   onImport(rows) — called with validated rows to import, returns { imported, skipped }
//   onClose
export function ImportModal({ title, fields, nameKey, existingNames, onImport, onClose }) {
  const [step, setStep]       = useState('upload');   // upload | map | preview | result
  const [csvData, setCsvData] = useState(null);       // { headers, rows }
  const [mapping, setMapping] = useState({});         // { fieldKey: csvHeader }
  const [preview, setPreview] = useState([]);         // mapped + annotated rows
  const [result, setResult]   = useState(null);       // { imported, skipped }
  const [importing, setImporting] = useState(false);
  const [err, setErr]         = useState('');
  const fileRef               = useRef();

  // ── Step 1: Upload ────────────────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (parsed.headers.length === 0) return setErr('Could not parse CSV. Make sure it has a header row.');
        setCsvData(parsed);
        setMapping(autoMap(parsed.headers, fields));
        setErr('');
        setStep('map');
      } catch (e) {
        setErr('Failed to read file.');
      }
    };
    reader.readAsText(file);
  }

  // ── Step 2: Map ───────────────────────────────────────
  function buildPreview() {
    const missingRequired = fields.filter(f => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      return setErr(`Please map required fields: ${missingRequired.map(f => f.label).join(', ')}`);
    }
    setErr('');
    const rows = csvData.rows.map(row => {
      const mapped = {};
      fields.forEach(f => {
        mapped[f.key] = mapping[f.key] ? row[mapping[f.key]] || '' : '';
      });
      const name = mapped[nameKey] || '';
      const isDupe = name && existingNames.has(name.toLowerCase());
      const missingReq = fields.filter(f => f.required && !mapped[f.key]);
      return { ...mapped, _dupe: isDupe, _invalid: missingReq.length > 0, _issues: missingReq.map(f => f.label) };
    });
    setPreview(rows);
    setStep('preview');
  }

  // ── Step 3: Import ────────────────────────────────────
  async function handleImport() {
    const toImport = preview.filter(r => !r._dupe && !r._invalid);
    const skipped  = preview.filter(r => r._dupe || r._invalid);
    setImporting(true);
    try {
      await onImport(toImport.map(r => {
        const clean = { ...r };
        delete clean._dupe; delete clean._invalid; delete clean._issues;
        return clean;
      }));
      setResult({
        imported: toImport.length,
        skipped: skipped.map(r => ({
          name: r[nameKey] || '(unnamed)',
          reason: r._dupe ? 'Duplicate' : `Missing: ${r._issues.join(', ')}`,
        })),
      });
      setStep('result');
    } catch (e) {
      setErr(e.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 4 };
  const selectStyle = { width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', color: 'var(--text)', fontSize: 13 };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-title">{title}</div>

        {/* ── Step indicator ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {['Upload', 'Map Columns', 'Preview', 'Done'].map((s, i) => {
            const stepKeys = ['upload', 'map', 'preview', 'result'];
            const active = step === stepKeys[i];
            const done   = stepKeys.indexOf(step) > i;
            return (
              <div key={s} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600,
                color: active ? 'var(--accent2)' : done ? 'var(--green,#4caf50)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--accent2)' : '2px solid transparent',
              }}>
                {done ? '✓ ' : ''}{s}
              </div>
            );
          })}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── Upload ── */}
          {step === 'upload' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Upload a CSV file with a header row. Column names don't need to match exactly — you'll map them in the next step.
              </p>
              <div
                style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Click to select a CSV file</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
              </div>
            </div>
          )}

          {/* ── Map Columns ── */}
          {step === 'map' && csvData && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Found <strong>{csvData.rows.length} rows</strong> and <strong>{csvData.headers.length} columns</strong>. Map your CSV columns to the fields below.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                {fields.map(f => (
                  <div key={f.key}>
                    <label style={labelStyle}>
                      {f.label}
                      {f.required && <span style={{ color: 'var(--red,#e55)', marginLeft: 3 }}>*</span>}
                    </label>
                    <select value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} style={selectStyle}>
                      <option value="">— skip —</option>
                      {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {step === 'preview' && (
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 13 }}>
                <span style={{ color: 'var(--green,#4caf50)' }}>✓ {preview.filter(r => !r._dupe && !r._invalid).length} will import</span>
                {preview.filter(r => r._dupe).length > 0 && (
                  <span style={{ color: 'var(--yellow,#f5a623)' }}>⚠ {preview.filter(r => r._dupe).length} duplicates (will skip)</span>
                )}
                {preview.filter(r => r._invalid).length > 0 && (
                  <span style={{ color: 'var(--red,#e55)' }}>✕ {preview.filter(r => r._invalid).length} invalid (will skip)</span>
                )}
              </div>
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}></th>
                      {fields.filter(f => mapping[f.key]).map(f => <th key={f.key}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => (
                      <tr key={idx} style={{
                        background: row._dupe ? 'rgba(245,166,35,0.08)' : row._invalid ? 'rgba(229,85,85,0.08)' : 'transparent',
                        opacity: (row._dupe || row._invalid) ? 0.7 : 1,
                      }}>
                        <td style={{ fontSize: 12 }}>
                          {row._dupe ? <span title="Duplicate — will skip" style={{ color: 'var(--yellow,#f5a623)' }}>⚠</span>
                            : row._invalid ? <span title={`Missing: ${row._issues.join(', ')}`} style={{ color: 'var(--red,#e55)' }}>✕</span>
                            : <span style={{ color: 'var(--green,#4caf50)' }}>✓</span>}
                        </td>
                        {fields.filter(f => mapping[f.key]).map(f => (
                          <td key={f.key} style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[f.key] || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Result ── */}
          {step === 'result' && result && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
                ✓ Imported {result.imported} record{result.imported !== 1 ? 's' : ''}
              </div>
              {result.skipped.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    Skipped ({result.skipped.length})
                  </div>
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', maxHeight: 240, overflowY: 'auto' }}>
                    {result.skipped.map((s, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: i < result.skipped.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          {step === 'upload' && <button className="btn btn-secondary" onClick={onClose}>Cancel</button>}

          {step === 'map' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setStep('upload'); setErr(''); }}>Back</button>
              <button className="btn btn-primary" onClick={buildPreview}>Preview →</button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setStep('map'); setErr(''); }}>Back</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || preview.filter(r => !r._dupe && !r._invalid).length === 0}
              >
                {importing ? 'Importing…' : `Import ${preview.filter(r => !r._dupe && !r._invalid).length} Records`}
              </button>
            </>
          )}

          {step === 'result' && (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
