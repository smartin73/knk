import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { RowMenu } from '../components/RowMenu.jsx';

const SOURCES = ['square', 'website', 'manual'];
const SOURCE_LABELS = { square: 'Square', website: 'Website', manual: 'Manual' };
const EXPENSE_CATEGORIES = ['Ingredients', 'Packaging', 'Supplies', 'Equipment', 'Fees', 'Marketing', 'Other'];

const EMPTY_INCOME  = { source: 'square', amount: '', date: '', event_id: '', description: '', notes: '' };
const EMPTY_EXPENSE = { category: '', amount: '', date: '', description: '', notes: '' };

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    description: entry.description || '',
    notes:       entry.notes || '',
  } : { ...EMPTY_EXPENSE, date: today() });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.category.trim()) return setErr('Category is required.');
    if (!form.amount || Number(form.amount) <= 0) return setErr('Amount is required.');
    if (!form.date) return setErr('Date is required.');
    setErr(''); setSaving(true);
    try { await onSave(form); } catch (e) { setErr(e.message || 'Save failed.'); } finally { setSaving(false); }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{entry ? 'Edit Expense' : 'Add Expense'}</div>
        <div className="form-grid">
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
            <label>Description</label>
            <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. Flour from Bob's Mill" />
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
            {saving ? 'Saving…' : entry ? 'Save Changes' : 'Add Expense'}
          </button>
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
  const [tab,      setTab]      = useState('income'); // 'income' | 'expenses'
  const [modal,    setModal]    = useState(null); // null | 'income' | 'expense' | entry object

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
        <button className="btn btn-primary"
          onClick={() => setModal(tab === 'income' ? 'income' : 'expense')}>
          {tab === 'income' ? '+ Add Income' : '+ Add Expense'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[['income', 'Income'], ['expenses', 'Expenses']].map(([key, label]) => (
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
    </div>
  );
}
