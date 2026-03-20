import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { RowMenu } from '../components/RowMenu.jsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
         PieChart, Pie, Cell } from 'recharts';

const SOURCES = ['square', 'website', 'manual'];
const SOURCE_LABELS = { square: 'Square', website: 'Website', manual: 'Manual' };
const EXPENSE_CATEGORIES = ['Ingredients', 'Packaging', 'Supplies', 'Equipment', 'Fees', 'Marketing', 'Other'];

const COLOR_INCOME    = '#4caf82';
const COLOR_EXPENSES  = '#e05c5c';
const COLOR_DONATIONS = '#e8a13a';
const DONUT_COLORS    = ['#6c63ff','#9d95ff','#e8a13a','#4caf82','#e05c5c','#7c809a','#38b2ac'];

function startOfYear()  { return `${new Date().getFullYear()}-01-01`; }
function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function fmtMonth(m) {
  const [y, mo] = m.split('-');
  return new Date(+y, +mo-1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

const EMPTY_INCOME  = { source: 'square', amount: '', date: '', event_id: '', description: '', notes: '' };
const EMPTY_EXPENSE = { category: '', amount: '', date: '', vendor: '', description: '', notes: '', receipt_url: '' };

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMoney(val) {
  return Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Income Modal ───────────────────────────────────────
function IncomeModal({ entry, events, onSave, onCancel }) {
  const [form, setForm] = useState(entry ? {
    source:      entry.source,
    amount:      entry.amount,
    date:        entry.date?.split('T')[0] || '',
    event_id:    entry.event_id || '',
    description: entry.description || '',
    notes:       entry.notes || '',
  } : { ...EMPTY_INCOME, date: today() });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.amount || Number(form.amount) <= 0) return setErr('Amount is required.');
    if (!form.date) return setErr('Date is required.');
    setErr(''); setSaving(true);
    try { await onSave(form); } catch (e) { setErr(e.message || 'Save failed.'); } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{entry ? 'Edit Income' : 'Add Income'}</div>
        <div className="form-grid">
          <div className="field">
            <label>Source</label>
            <select value={form.source} onChange={e => set('source', e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
              {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="field">
            <label>Event <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <select value={form.event_id} onChange={e => set('event_id', e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
              <option value="">— None —</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name}</option>)}
            </select>
          </div>
          <div className="field full">
            <label>Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Farmers Market May 10" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : entry ? 'Save Changes' : 'Add Income'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Expense Modal ──────────────────────────────────────
function ExpenseModal({ entry, onSave, onCancel }) {
  const [form, setForm] = useState(entry ? {
    category:    entry.category,
    amount:      entry.amount,
    date:        entry.date?.split('T')[0] || '',
    vendor:      entry.vendor || '',
    description: entry.description || '',
    notes:       entry.notes || '',
    receipt_url: entry.receipt_url || '',
  } : { ...EMPTY_EXPENSE, date: today() });
  const [saving,   setSaving]   = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [err,      setErr]      = useState('');
  const fileInputRef = React.useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleReceiptFile(files) {
    if (!files?.length) return;
    setParseErr(''); setParsing(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/finance/parse-receipt', {
        method: 'POST', body: fd, credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      const { parsed, receipt_url } = data;
      setForm(f => ({
        ...f,
        vendor:      parsed.vendor  || f.vendor,
        date:        parsed.date    || f.date,
        amount:      parsed.amount  != null ? parsed.amount : f.amount,
        category:    parsed.category || f.category,
        receipt_url: receipt_url || f.receipt_url,
      }));
    } catch (e) {
      setParseErr(e.message || 'Could not parse receipt.');
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!form.category.trim()) return setErr('Category is required.');
    if (!form.amount || Number(form.amount) <= 0) return setErr('Amount is required.');
    if (!form.date) return setErr('Date is required.');
    if (!form.description.trim()) return setErr('Description is required (brief note for accountant).');
    setErr(''); setSaving(true);
    try { await onSave(form); } catch (e) { setErr(e.message || 'Save failed.'); } finally { setSaving(false); }
  }

  const dropZoneStyle = {
    border: `2px dashed var(--border)`,
    borderRadius: 8,
    padding: '14px 16px',
    textAlign: 'center',
    cursor: 'pointer',
    marginBottom: 16,
    color: 'var(--text-muted)',
    fontSize: 13,
    background: 'var(--surface2)',
    transition: 'border-color 0.15s',
  };

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-title">{entry ? 'Edit Expense' : 'Add Expense'}</div>

        {/* Receipt drop zone */}
        <div
          style={dropZoneStyle}
          onClick={() => fileInputRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleReceiptFile(e.dataTransfer.files); }}
        >
          {parsing ? (
            <span>Scanning receipt…</span>
          ) : form.receipt_url ? (
            <span style={{ color: 'var(--text)' }}>
              ✓ Receipt attached —{' '}
              <a href={form.receipt_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)' }}>view</a>
              {' · '}
              <span style={{ textDecoration: 'underline' }}>replace</span>
            </span>
          ) : (
            <span>
              📷 Drop receipt / invoice here, or <span style={{ textDecoration: 'underline' }}>click to upload</span>
              <br />
              <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>JPEG, PNG, PDF · Fields auto-filled via AI · Long receipt? Use a PDF for best results.</span>
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
          multiple
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => handleReceiptFile(e.target.files)}
        />
        {parseErr && <div className="error-msg" style={{ marginBottom: 8 }}>{parseErr}</div>}

        <div className="form-grid">
          <div className="field full">
            <label>Vendor</label>
            <input value={form.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Restaurant Depot" />
          </div>
          <div className="field">
            <label>Category</label>
            <input list="expense-cats" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Ingredients" />
            <datalist id="expense-cats">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Amount ($)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="field full">
            <label>Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(brief note for accountant)</span></label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Flour and butter for March stock" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || parsing}>
            {saving ? 'Saving…' : entry ? 'Save Changes' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Amazon CSV Import Modal ────────────────────────────
function AmazonImportModal({ onClose, onImported }) {
  const [rows,      setRows]      = useState(null);
  const [selected,  setSelected]  = useState(new Set());
  const [loading,   setLoading]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result,    setResult]    = useState(null);
  const [err,       setErr]       = useState('');
  const fileInputRef = React.useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setErr(''); setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/finance/import-amazon-csv', {
        method: 'POST', body: fd, credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      setRows(data.rows);
      setSelected(new Set(data.rows.map((_, i) => i)));
    } catch (e) {
      setErr(e.message || 'Could not parse CSV.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    const toImport = rows.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return setErr('No rows selected.');
    setImporting(true); setErr('');
    try {
      const res = await fetch('/api/finance/import-amazon-csv/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: toImport }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      onImported();
    } catch (e) {
      setErr(e.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  function toggleRow(i) {
    setSelected(s => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-title">Import Amazon Business CSV</div>

        {result ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Done — <strong style={{ color: 'var(--text)' }}>{result.inserted}</strong> imported,{' '}
              <strong style={{ color: 'var(--text)' }}>{result.skipped}</strong> skipped (duplicates).
            </p>
            <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Close</button></div>
          </>
        ) : !rows ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 12 }}>
              Export your order history from Amazon Business → Orders → Order History Reports, then upload the CSV here.
            </p>
            {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => fileInputRef.current.click()} disabled={loading}>
                {loading ? 'Parsing…' : 'Choose CSV File'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
              {rows.length} rows found. Uncheck any you want to skip (e.g. personal orders or duplicates), then confirm.
            </p>
            <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ opacity: selected.has(i) ? 1 : 0.4 }}>
                      <td><input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} /></td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtDate(r.date)}</td>
                      <td style={{ fontSize: 13 }}>{r.vendor}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                      <td><span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-muted)' }}>{r.category}</span></td>
                      <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={importing}>
                {importing ? 'Importing…' : `Import ${selected.size} row${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Finance Dashboard ──────────────────────────────────
function FinanceDashboard({ summary, loading, range, from, to, onRangeChange, onFromChange, onToChange }) {
  if (loading) return <div className="loading">Loading…</div>;
  if (!summary) return null;

  const RANGES = [['month','This Month'],['ytd','This Year'],['all','All Time'],['custom','Custom']];
  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:13 };
  const tooltipStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text)' };

  return (
    <div>
      {/* Date range filter */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:20 }}>
        {RANGES.map(([key, label]) => (
          <button key={key} onClick={() => onRangeChange(key)}
            className={`btn btn-sm ${range === key ? 'btn-primary' : 'btn-secondary'}`}>
            {label}
          </button>
        ))}
        {range === 'custom' && <>
          <input type="date" value={from} onChange={e => onFromChange(e.target.value)} style={inputStyle} />
          <span style={{ color:'var(--text-muted)', fontSize:13 }}>to</span>
          <input type="date" value={to} onChange={e => onToChange(e.target.value)} style={inputStyle} />
        </>}
      </div>

      {/* KPI cards */}
      <div className="stats-grid">
        {[
          { label:'Total Income',   value: fmtMoney(summary.totalIncome),   color: COLOR_INCOME },
          { label:'Total Expenses', value: fmtMoney(summary.totalExpenses),  color: COLOR_EXPENSES },
          { label:'Donations',      value: fmtMoney(summary.totalDonations), color: COLOR_DONATIONS },
          { label:'Net Profit',     value: fmtMoney(summary.net), color: summary.net >= 0 ? COLOR_INCOME : COLOR_EXPENSES },
        ].map(k => (
          <div key={k.label} className="card">
            <div className="card-title">{k.label}</div>
            <div className="card-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      {summary.timeSeries.length === 0 ? (
        <div className="card" style={{ marginBottom:16 }}>
          <div className="empty-state"><p>No transactions in this period.</p></div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom:12 }}>Monthly Income vs Expenses</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={summary.timeSeries} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill:'var(--text-muted)', fontSize:11 }} />
                <YAxis tickFormatter={v => `$${v.toLocaleString()}`} tick={{ fill:'var(--text-muted)', fontSize:11 }} width={72} />
                <Tooltip formatter={v => fmtMoney(v)} labelFormatter={fmtMonth} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize:12 }} />
                <Bar dataKey="income"   fill={COLOR_INCOME}   name="Income"   radius={[3,3,0,0]} />
                <Bar dataKey="expenses" fill={COLOR_EXPENSES}  name="Expenses" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom:12 }}>Expenses by Category</div>
            {summary.expensesByCategory.length === 0 ? (
              <div style={{ color:'var(--text-muted)', fontSize:13 }}>No expense data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={summary.expensesByCategory} dataKey="total" nameKey="category"
                    cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={2}>
                    {summary.expensesByCategory.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => fmtMoney(v)} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Breakdown tables */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card" style={{ padding:0 }}>
          <div style={{ padding:'12px 16px', fontWeight:700, fontSize:13, borderBottom:'1px solid var(--border)' }}>Expense Breakdown</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Category</th><th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>%</th></tr></thead>
              <tbody>
                {summary.expensesByCategory.length === 0 ? (
                  <tr><td colSpan={3} style={{ color:'var(--text-muted)', textAlign:'center', padding:16 }}>No data.</td></tr>
                ) : summary.expensesByCategory.map((r, i) => (
                  <tr key={r.category}>
                    <td>
                      <span style={{ display:'inline-block', width:9, height:9, borderRadius:2, background:DONUT_COLORS[i%DONUT_COLORS.length], marginRight:7 }} />
                      {r.category}
                    </td>
                    <td style={{ textAlign:'right', color:COLOR_EXPENSES }}>{fmtMoney(r.total)}</td>
                    <td style={{ textAlign:'right', color:'var(--text-muted)' }}>
                      {summary.totalExpenses > 0 ? ((r.total/summary.totalExpenses)*100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding:0 }}>
          <div style={{ padding:'12px 16px', fontWeight:700, fontSize:13, borderBottom:'1px solid var(--border)' }}>Income by Source</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Source</th><th style={{textAlign:'right'}}>Total</th><th style={{textAlign:'right'}}>%</th></tr></thead>
              <tbody>
                {summary.incomeBySource.length === 0 ? (
                  <tr><td colSpan={3} style={{ color:'var(--text-muted)', textAlign:'center', padding:16 }}>No data.</td></tr>
                ) : summary.incomeBySource.map(r => (
                  <tr key={r.source}>
                    <td>{SOURCE_LABELS[r.source] ?? r.source}</td>
                    <td style={{ textAlign:'right', color:COLOR_INCOME }}>{fmtMoney(r.total)}</td>
                    <td style={{ textAlign:'right', color:'var(--text-muted)' }}>
                      {summary.totalIncome > 0 ? ((r.total/summary.totalIncome)*100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Finance Page ───────────────────────────────────────
export function FinancePage() {
  const [income,   setIncome]   = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,         setTab]         = useState('dashboard');
  const [modal,       setModal]       = useState(null);
  const [amazonModal, setAmazonModal] = useState(false);

  // dashboard state
  const [dashRange,      setDashRange]      = useState('ytd');
  const [dashFrom,       setDashFrom]       = useState(startOfYear());
  const [dashTo,         setDashTo]         = useState(today());
  const [summary,        setSummary]        = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // export state
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo,   setExportTo]   = useState('');
  const [exporting,  setExporting]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, exp, evs] = await Promise.all([
        api.get('/finance/income'),
        api.get('/finance/expenses'),
        api.get('/events'),
      ]);
      setIncome(inc);
      setExpenses(exp);
      setEvents(evs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSummary = useCallback(async (from, to) => {
    setSummaryLoading(true);
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to)   p.set('to', to);
      setSummary(await api.get(`/finance/summary?${p}`));
    } catch (e) { console.error(e); }
    finally { setSummaryLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'dashboard') loadSummary(dashFrom, dashTo);
  }, [tab, dashFrom, dashTo, loadSummary]);

  function handleRangeChange(r) {
    setDashRange(r);
    if (r === 'month') { setDashFrom(startOfMonth()); setDashTo(today()); }
    else if (r === 'ytd') { setDashFrom(startOfYear()); setDashTo(today()); }
    else if (r === 'all') { setDashFrom(''); setDashTo(''); }
  }

  async function handleSaveIncome(form) {
    if (modal?.id) await api.put(`/finance/income/${modal.id}`, form);
    else           await api.post('/finance/income', form);
    setModal(null); load();
  }

  async function handleSaveExpense(form) {
    if (modal?.id) await api.put(`/finance/expenses/${modal.id}`, form);
    else           await api.post('/finance/expenses', form);
    setModal(null); load();
  }

  async function handleDeleteIncome(e) {
    if (!confirm('Delete this income entry?')) return;
    await api.delete(`/finance/income/${e.id}`); load();
  }

  async function handleDeleteExpense(e) {
    if (!confirm('Delete this expense entry?')) return;
    await api.delete(`/finance/expenses/${e.id}`); load();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set('from', exportFrom);
      if (exportTo)   params.set('to', exportTo);
      const res = await fetch(`/api/finance/export?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'income-expenses.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const totalIncome   = income.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const net = totalIncome - totalExpenses;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">💰 Income & Expenses</div>
          <div className="page-subtitle">
            <span style={{ color: 'var(--green, #4caf50)' }}>{fmtMoney(totalIncome)} income</span>
            {' · '}
            <span style={{ color: 'var(--red)' }}>{fmtMoney(totalExpenses)} expenses</span>
            {' · '}
            <span style={{ fontWeight: 600, color: net >= 0 ? 'var(--green, #4caf50)' : 'var(--red)' }}>
              {fmtMoney(net)} net
            </span>
          </div>
        </div>
        {/* Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {tab === 'expenses' && (
          <button className="btn btn-secondary" onClick={() => setAmazonModal(true)}>
            Import Amazon CSV
          </button>
        )}
        {tab !== 'dashboard' && (
          <button className="btn btn-primary"
            onClick={() => setModal(tab === 'income' ? 'income' : 'expense')}>
            {tab === 'income' ? '+ Add Income' : '+ Add Expense'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[['income', 'Income'], ['expenses', 'Expenses'], ['dashboard', 'Dashboard']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Income tab */}
      {tab === 'income' && (
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading">Loading…</div> : income.length === 0 ? (
            <div className="empty-state"><p>No income entries yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Description</th>
                    <th>Event</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {income.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          background: 'var(--surface2)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {SOURCE_LABELS[r.source] || r.source}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.description || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.event_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green, #4caf50)' }}>{fmtMoney(r.amount)}</td>
                      <td>
                        <div className="actions">
                          <RowMenu actions={[
                            { label: 'Edit', onClick: () => setModal(r) },
                            { label: 'Delete', onClick: () => handleDeleteIncome(r), danger: true },
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
      )}

      {/* Expenses tab */}
      {tab === 'expenses' && (
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="loading">Loading…</div> : expenses.length === 0 ? (
            <div className="empty-state"><p>No expense entries yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                      <td style={{ fontSize: 13 }}>
                        {r.vendor || '—'}
                        {r.receipt_url && (
                          <a href={r.receipt_url} target="_blank" rel="noreferrer"
                            style={{ marginLeft: 6, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
                            title="View receipt">🧾</a>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          background: 'var(--surface2)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {r.category}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{fmtMoney(r.amount)}</td>
                      <td>
                        <div className="actions">
                          <RowMenu actions={[
                            { label: 'Edit', onClick: () => setModal(r) },
                            { label: 'Delete', onClick: () => handleDeleteExpense(r), danger: true },
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
      )}

      {/* Dashboard tab */}
      {tab === 'dashboard' && (
        <FinanceDashboard
          summary={summary}
          loading={summaryLoading}
          range={dashRange}
          from={dashFrom}
          to={dashTo}
          onRangeChange={handleRangeChange}
          onFromChange={v => setDashFrom(v)}
          onToChange={v => setDashTo(v)}
        />
      )}

      {/* Modals */}
      {(modal === 'income' || (modal?.source !== undefined)) && (
        <IncomeModal
          entry={modal === 'income' ? null : modal}
          events={events}
          onSave={handleSaveIncome}
          onCancel={() => setModal(null)}
        />
      )}
      {(modal === 'expense' || (modal?.category !== undefined)) && (
        <ExpenseModal
          entry={modal === 'expense' ? null : modal}
          onSave={handleSaveExpense}
          onCancel={() => setModal(null)}
        />
      )}
      {amazonModal && (
        <AmazonImportModal
          onClose={() => setAmazonModal(false)}
          onImported={() => { load(); }}
        />
      )}
    </div>
  );
}
