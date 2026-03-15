import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { RowMenu } from '../components/RowMenu.jsx';

const EMPTY_FORM = { event_id: '', item_builder_id: '', quantity: 1, unit_value: '', donated_at: '', notes: '' };

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(val) {
  return Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── Donation Modal ─────────────────────────────────────
function DonationModal({ donation, events, items, onSave, onCancel }) {
  const [form, setForm] = useState(donation ? {
    event_id:       donation.event_id       || '',
    item_builder_id: donation.item_builder_id || '',
    quantity:       donation.quantity        || 1,
    unit_value:     donation.unit_value      || '',
    donated_at:     donation.donated_at ? donation.donated_at.split('T')[0] : '',
    notes:          donation.notes           || '',
  } : { ...EMPTY_FORM, donated_at: new Date().toISOString().split('T')[0] });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleItemChange(item_builder_id) {
    const item = items.find(i => i.id === item_builder_id);
    set('item_builder_id', item_builder_id);
    if (item && !donation) set('unit_value', item.retail_price ?? '');
  }

  async function handleSubmit() {
    if (!form.item_builder_id) return setErr('Item is required.');
    if (!form.quantity || form.quantity <= 0) return setErr('Quantity must be greater than 0.');
    if (form.unit_value === '' || form.unit_value < 0) return setErr('Unit value is required.');
    setErr(''); setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!donation;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{isEdit ? 'Edit Donation' : 'Log Donation'}</div>
        <div className="form-grid">
          <div className="field full">
            <label>Event <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <select value={form.event_id} onChange={e => set('event_id', e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
              <option value="">— No event —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.event_name}{ev.event_date ? ` (${fmtDate(ev.event_date)})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label>Item</label>
            <select value={form.item_builder_id} onChange={e => handleItemChange(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
              <option value="">— Select item —</option>
              {items.map(it => (
                <option key={it.id} value={it.id}>{it.item_name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quantity</label>
            <input type="number" min="1" step="1" value={form.quantity}
              onChange={e => set('quantity', e.target.value)} />
          </div>
          <div className="field">
            <label>Unit Value ($)</label>
            <input type="number" min="0" step="0.01" value={form.unit_value}
              onChange={e => set('unit_value', e.target.value)}
              placeholder="Auto-filled from retail price" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.donated_at} onChange={e => set('donated_at', e.target.value)} />
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Log Donation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export Bar ─────────────────────────────────────────
function ExportBar() {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      const res = await fetch(`/api/donations/export?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'donations.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)}
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
      <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={loading}>
        {loading ? 'Exporting…' : 'Export CSV'}
      </button>
    </div>
  );
}

// ── Donations Page ─────────────────────────────────────
export function DonationsPage() {
  const [donations, setDonations] = useState([]);
  const [events,    setEvents]    = useState([]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | 'create' | donation object

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, e, it] = await Promise.all([
        api.get('/donations'),
        api.get('/events'),
        api.get('/items'),
      ]);
      setDonations(d);
      setEvents(e);
      setItems(it.filter(i => i.is_active));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (modal === 'create') {
      await api.post('/donations', form);
    } else {
      await api.put(`/donations/${modal.id}`, form);
    }
    setModal(null);
    load();
  }

  async function handleDelete(d) {
    if (!confirm(`Delete this donation? This cannot be undone.`)) return;
    await api.delete(`/donations/${d.id}`);
    load();
  }

  const totalValue = donations.reduce((sum, d) => sum + Number(d.total_value || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">💛 Donations</div>
          <div className="page-subtitle">
            {donations.length} donation{donations.length !== 1 ? 's' : ''}
            {donations.length > 0 && ` · ${fmtMoney(totalValue)} total value`}
          </div>
        </div>
        <ExportBar />
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Log Donation</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : donations.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>💛</div>
            <p>No donations logged yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Event</th>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Value</th>
                  <th style={{ textAlign: 'right' }}>Total Value</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {donations.map(d => (
                  <tr key={d.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(d.donated_at)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.event_name || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{d.item_name}</td>
                    <td style={{ textAlign: 'right' }}>{d.quantity}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtMoney(d.unit_value)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(d.total_value)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{d.notes || '—'}</td>
                    <td>
                      <div className="actions">
                        <RowMenu actions={[
                          { label: 'Edit', onClick: () => setModal(d) },
                          { label: 'Delete', onClick: () => handleDelete(d), danger: true },
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

      {(modal === 'create' || (modal && modal !== 'create')) && (
        <DonationModal
          donation={modal === 'create' ? null : modal}
          events={events}
          items={items}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
