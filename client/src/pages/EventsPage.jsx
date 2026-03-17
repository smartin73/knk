import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { ImportModal } from './ImportModal.jsx';
import { RowMenu } from '../components/RowMenu.jsx';
import { ImageUpload } from '../components/ImageUpload.jsx';

function LogSalesModal({ event, onClose }) {
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('square');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const [done,   setDone]   = useState(false);

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) return setErr('Amount is required.');
    setErr(''); setSaving(true);
    try {
      await api.post('/finance/income', {
        source,
        amount: Number(amount),
        date: event.event_date,
        event_id: event.id,
        description: event.event_name,
        notes: notes || null,
      });
      setDone(true);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Log Sales — {event.event_name}</div>
        {done ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Sales logged to Income & Expenses.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-grid">
              <div className="field">
                <label>Source</label>
                <select value={source} onChange={e => setSource(e.target.value)}
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
                  <option value="square">Square</option>
                  <option value="website">Website</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="field">
                <label>Total Sales ($)</label>
                <input autoFocus type="number" min="0" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
              <div className="field full">
                <label>Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : 'Log Sales'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_BADGES = {
  draft:     'badge-gray',
  confirmed: 'badge-blue',
  active:    'badge-green',
  cancelled: 'badge-red',
  completed: 'badge-yellow',
};

const STATUSES = ['draft', 'confirmed', 'active', 'completed', 'cancelled'];

const EMPTY_FORM = {
  vendor_id: '',
  event_name: '',
  event_date: '',
  start_time: '',
  end_time: '',
  location: '',
  description: '',
  image_url: '',
  ticket_url: '',
  map_embed: '',
  category: '',
  tags: '',
  price: '',
  status: 'draft',
};

// Import fields — vendor_name is a virtual field resolved to vendor_id on import
const IMPORT_FIELDS = [
  { key: 'event_name',   label: 'Event Name',   required: true  },
  { key: 'event_date',   label: 'Date',         required: true  },
  { key: 'vendor_name',  label: 'Vendor Name',  required: false },
  { key: 'status',       label: 'Status',       required: false },
  { key: 'start_time',   label: 'Start Time',   required: false },
  { key: 'end_time',     label: 'End Time',     required: false },
  { key: 'location',     label: 'Location',     required: false },
  { key: 'category',     label: 'Category',     required: false },
  { key: 'tags',         label: 'Tags',         required: false },
  { key: 'price',        label: 'Price',        required: false },
  { key: 'description',  label: 'Description',  required: false },
  { key: 'ticket_url',   label: 'Ticket URL',   required: false },
  { key: 'image_url',    label: 'Image URL',    required: false },
];

function fmt(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text)' : 'var(--text-muted)' }}>{value || '—'}</div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────
function EventDetail({ event, onEdit, onClose }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{event.event_name}</div>
            {event.category && <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>{event.category}</div>}
          </div>
          <span className={`badge ${STATUS_BADGES[event.status] || 'badge-gray'}`} style={{ marginTop: 4 }}>
            {event.status}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 20 }}>
          <DetailRow label="Date" value={fmt(event.event_date)} />
          <DetailRow label="Time" value={
            event.start_time
              ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}`
              : null
          } />
          <DetailRow label="Location" value={event.location} />
          <DetailRow label="Vendor" value={event.vendor_name} />
          <DetailRow label="Price" value={event.price ? `$${parseFloat(event.price).toFixed(2)}` : null} />
          <DetailRow label="Tags" value={event.tags} />
          <DetailRow label="Posted to Web" value={event.woo_id ? 'Yes' : 'No'} />
          {event.ticket_url && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Ticket URL</div>
              <a href={event.ticket_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)', fontSize: 13 }}>Link</a>
            </div>
          )}
        </div>

        {event.description && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{event.description}</div>
          </div>
        )}

        {event.image_url && (
          <div style={{ marginBottom: 16 }}>
            <img src={event.image_url} alt={event.event_name} style={{ width: '100%', borderRadius: 8, objectFit: 'cover', maxHeight: 240, display: 'block' }} />
          </div>
        )}

        {event.map_embed && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Map</div>
            <div dangerouslySetInnerHTML={{ __html: event.map_embed }} style={{ borderRadius: 6, overflow: 'hidden' }} />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onEdit}>Edit</button>
        </div>
      </div>
    </div>
  );
}

// ── Event Form ────────────────────────────────────────────
function EventForm({ initial, vendors, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleVendorChange(vendorId) {
    set('vendor_id', vendorId);
    if (vendorId) {
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor && !form.location) {
        const parts = [vendor.address, vendor.city, vendor.state, vendor.zip].filter(Boolean);
        if (parts.length) set('location', parts.join(', '));
      }
    }
  }

  async function handleSubmit() {
    if (!form.event_name.trim()) return setErr('Event name is required.');
    if (!form.event_date)        return setErr('Event date is required.');
    setErr(''); setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-title">{initial?.id ? 'Edit Event' : 'New Event'}</div>

        <div className="form-grid">
          <div className="field full">
            <label>Event Name</label>
            <input value={form.event_name} onChange={e => set('event_name', e.target.value)} placeholder="e.g. Knife Skills Workshop" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.event_date ? String(form.event_date).slice(0, 10) : ''} onChange={e => set('event_date', e.target.value)} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Start Time</label>
            <input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} />
          </div>
          <div className="field">
            <label>End Time</label>
            <input type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} />
          </div>
          <div className="field">
            <label>Vendor</label>
            <select value={form.vendor_id || ''} onChange={e => handleVendorChange(e.target.value)}>
              <option value="">— No vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Category</label>
            <input value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="e.g. Workshop, Pop-up" />
          </div>
          <div className="field full">
            <label>Location</label>
            <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Venue name or address (auto-fills from vendor)" />
          </div>
          <div className="field">
            <label>Price</label>
            <input type="number" step="0.01" value={form.price || ''} onChange={e => set('price', e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>Tags</label>
            <input value={form.tags || ''} onChange={e => set('tags', e.target.value)} placeholder="comma separated" />
          </div>
          <div className="field full">
            <label>Description</label>
            <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Event details..." />
          </div>
          <div className="field full">
            <label>Image</label>
            <ImageUpload value={form.image_url || ''} onChange={v => set('image_url', v)} />
          </div>
          <div className="field">
            <label>Ticket URL</label>
            <input value={form.ticket_url || ''} onChange={e => set('ticket_url', e.target.value)} placeholder="https://..." />
          </div>
          <div className="field full">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ margin: 0 }}>Map Embed</label>
              {form.location && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const src = `https://maps.google.com/maps?q=${encodeURIComponent(form.location)}&output=embed`;
                    set('map_embed', `<iframe src="${src}" width="100%" height="300" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`);
                  }}
                >
                  Generate from Location
                </button>
              )}
            </div>
            <textarea
              value={form.map_embed || ''}
              onChange={e => set('map_embed', e.target.value)}
              placeholder="Paste Google Maps iframe embed code, or generate from location above…"
              style={{ minHeight: 70 }}
            />
          </div>
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Repeat Modal ──────────────────────────────────────────
function RepeatModal({ event, onClose, onDone }) {
  const [frequency, setFrequency] = useState('weekly');
  const [until, setUntil]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');

  const srcDate = event.event_date ? String(event.event_date).slice(0, 10) : null;

  // Compute preview dates in JS so user sees them before confirming
  const preview = (() => {
    if (!srcDate || !until || until <= srcDate) return [];
    const stepDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : null;
    const dates = [];
    let cur = new Date(srcDate);
    const end = new Date(until);
    while (true) {
      if (stepDays) {
        cur.setDate(cur.getDate() + stepDays);
      } else {
        cur.setMonth(cur.getMonth() + 1);
      }
      if (cur > end) break;
      dates.push(cur.toISOString().slice(0, 10));
    }
    return dates;
  })();

  async function handleConfirm() {
    if (!until) return setErr('Please set an end date.');
    if (preview.length === 0) return setErr('No occurrences in range.');
    setErr(''); setSaving(true);
    try {
      const res = await api.post('/events/repeat', { event_id: event.id, frequency, until });
      onDone(res.created);
    } catch (e) {
      setErr(e.message || 'Failed to create events.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">Repeat Event</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Creates copies of <strong style={{ color: 'var(--text)' }}>{event.event_name}</strong>
          {srcDate && <> starting from <strong style={{ color: 'var(--text)' }}>{fmt(srcDate)}</strong></>}.
          Each copy is independent and starts as Draft.
        </p>

        <div className="form-grid">
          <div className="field">
            <label>Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="field">
            <label>Repeat until</label>
            <input
              type="date"
              value={until}
              min={srcDate || ''}
              onChange={e => setUntil(e.target.value)}
            />
          </div>
        </div>

        {preview.length > 0 && (
          <div style={{ marginTop: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              {preview.length} occurrence{preview.length !== 1 ? 's' : ''} will be created
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', maxHeight: 120, overflowY: 'auto' }}>
              {preview.map(d => (
                <span key={d} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(d)}</span>
              ))}
            </div>
          </div>
        )}

        {err && <div className="error-msg" style={{ marginTop: 10 }}>{err}</div>}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving || preview.length === 0}
          >
            {saving ? 'Creating…' : `Create ${preview.length > 0 ? preview.length : ''} Event${preview.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────
function DeleteConfirm({ event, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Delete Event</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{event.event_name}</strong>? This cannot be undone.
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

// ── Events Page ───────────────────────────────────────────
export function EventsPage() {
  const [events, setEvents]             = useState([]);
  const [vendors, setVendors]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal]               = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search)       params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const [evts, vens] = await Promise.all([
        api.get(`/events?${params}`),
        api.get('/vendors'),
      ]);
      setEvents(evts);
      setVendors(vens);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (modal.event?.id) {
      await api.put(`/events/${modal.event.id}`, form);
    } else {
      await api.post('/events', form);
    }
    setModal(null);
    load();
  }

  async function handleDelete() {
    await api.delete(`/events/${modal.event.id}`);
    setModal(null);
    load();
  }

  function handleRepeat(e) {
    setModal({ mode: 'repeat', event: e });
  }

  function handleDuplicate(e) {
    setModal({
      mode: 'new',
      event: {
        ...e,
        id: undefined,
        event_name: `Copy of ${e.event_name}`,
        event_date: '',
        start_time: '',
        end_time: '',
      },
    });
  }

  async function handleWpPush(event) {
    try {
      const res = await api.post(`/wordpress/push/${event.id}`, {});
      if (res.error) throw new Error(res.error);
      load();
    } catch (e) {
      alert('WordPress push failed: ' + (e.message || 'Unknown error'));
    }
  }

  async function handleWpUnlink(event) {
    if (!confirm("Unlink from WordPress? The event will remain on WordPress but won't be tracked here.")) return;
    await api.delete(`/wordpress/unlink/${event.id}`);
    load();
  }

  async function handleImport(rows) {
  const vendorMap = {};
  vendors.forEach(v => { vendorMap[v.vendor_name.trim().toLowerCase()] = v.id; });

  function normalizeDate(val) {
    if (!val) return null;
    const datePart = val.split(' ')[0];
    if (datePart.includes('/')) {
      const [m, d, y] = datePart.split('/');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return datePart;
  }

  function normalizeTime(val) {
    if (!val) return null;
    const val2 = val.trim();
    const fm = val2.match(/^(\d+)h\s+(\d+)m/);
    if (fm) {
      const h = parseInt(fm[1]);
      const m = parseInt(fm[2]);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    const parts = val2.split(' ');
    const timePart = parts.length > 1 ? parts[1] : parts[0];
    if (!timePart || !timePart.includes(':')) return null;
    const [h, m] = timePart.split(':');
    return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
  }

  for (const row of rows) {
    const vendor_id = row.vendor_name
      ? (vendorMap[row.vendor_name.trim().toLowerCase()] || null)
      : null;

    const status = STATUSES.includes((row.status || '').toLowerCase())
      ? row.status.toLowerCase()
      : 'draft';

    await api.post('/events', {
      event_name:    row.event_name,
      event_date:    normalizeDate(row.event_date),
      vendor_id,
      status,
      start_time:    normalizeTime(row.start_time),
      end_time:      normalizeTime(row.end_time),
      location:      row.location    || null,
      category:      row.category    || null,
      tags:          row.tags        || null,
      price:         row.price       ? parseFloat(row.price) : null,
      description:   row.description || null,
      ticket_url:    row.ticket_url  || null,
      image_url:     row.image_url   || null,
      map_embed:     null,
      posted_to_web: false,
    });
  }
  load();
}

  const existingEventNames = new Set(events.map(e => e.event_name.toLowerCase()));

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = events.filter(e => e.status === s).length;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📅 Events</div>
          <div className="page-subtitle">{events.length} event{events.length !== 1 ? 's' : ''} total</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setModal({ mode: 'import' })}>
            ↑ Import
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>
            + New Event
          </button>
        </div>
      </div>

      {/* Status summary */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {STATUSES.map(s => (
          <div
            key={s}
            className="card"
            style={{ cursor: 'pointer', borderColor: statusFilter === s ? 'var(--accent)' : undefined }}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
          >
            <div className="card-title">{s}</div>
            <div className="card-value">{counts[s] || 0}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="search-bar">
        <input
          style={{ flex: 1, maxWidth: 320, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          placeholder="Search events…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>📅</div>
            <p>No events found. Create your first event to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Location</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Web</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div
                        style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--accent2)' }}
                        onClick={() => setModal({ mode: 'detail', event: e })}
                      >
                        {e.event_name}
                      </div>
                      {e.category && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.category}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(e.event_date)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{e.location || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{e.vendor_name || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGES[e.status] || 'badge-gray'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td>{e.woo_id ? <span className="badge badge-green" style={{ fontSize: 11 }}>Posted</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td>
                      <div className="actions">
                        <RowMenu actions={[
                          { label: 'Edit',      onClick: () => setModal({ mode: 'edit', event: e }) },
                          { label: 'Duplicate', onClick: () => handleDuplicate(e) },
                          { label: 'Repeat…',   onClick: () => handleRepeat(e) },
                          { label: 'Log Sales', onClick: () => setModal({ mode: 'log-sales', event: e }) },
                          e.woo_id
                            ? { label: 'Sync to Web',   onClick: () => handleWpPush(e) }
                            : { label: 'Push to Web',   onClick: () => handleWpPush(e) },
                          ...(e.woo_id ? [{ label: 'Unlink from Web', onClick: () => handleWpUnlink(e) }] : []),
                          { label: 'Delete',    onClick: () => setModal({ mode: 'delete', event: e }), danger: true },
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
        <EventDetail
          event={modal.event}
          onEdit={() => setModal({ mode: 'edit', event: modal.event })}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.mode === 'new' || modal?.mode === 'edit') && (
        <EventForm
          initial={modal.event}
          vendors={vendors}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirm
          event={modal.event}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'repeat' && (
        <RepeatModal
          event={modal.event}
          onClose={() => setModal(null)}
          onDone={(count) => { setModal(null); load(); alert(`${count} event${count !== 1 ? 's' : ''} created.`); }}
        />
      )}
      {modal?.mode === 'log-sales' && (
        <LogSalesModal event={modal.event} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'import' && (
        <ImportModal
          title="Import Events"
          fields={IMPORT_FIELDS}
          nameKey="event_name"
          existingNames={existingEventNames}
          onImport={handleImport}
          onClose={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
