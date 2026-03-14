import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { ImportModal } from './ImportModal.jsx';
import { ImageUpload } from '../components/ImageUpload.jsx';

const EMPTY_FORM = {
  vendor_name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  website_url: '',
  logo_url: '',
  map_embed: '',
};

const IMPORT_FIELDS = [
  { key: 'vendor_name',  label: 'Vendor Name', required: true  },
  { key: 'address',      label: 'Address',      required: false },
  { key: 'city',         label: 'City',         required: false },
  { key: 'state',        label: 'State',        required: false },
  { key: 'zip',          label: 'Zip',          required: false },
  { key: 'website_url',  label: 'Website',      required: false },
  { key: 'logo_url',     label: 'Logo URL',     required: false },
];

function VendorForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.vendor_name.trim()) return setErr('Vendor name is required.');
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
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-title">{initial?.id ? 'Edit Vendor' : 'New Vendor'}</div>

        <div className="form-grid">
          <div className="field full">
            <label>Vendor Name</label>
            <input value={form.vendor_name} onChange={e => set('vendor_name', e.target.value)} placeholder="e.g. Green City Market" />
          </div>
          <div className="field full">
            <label>Address</label>
            <input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="Street address" />
          </div>
          <div className="field">
            <label>City</label>
            <input value={form.city || ''} onChange={e => set('city', e.target.value)} placeholder="Chicago" />
          </div>
          <div className="field">
            <label>State</label>
            <input value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="IL" />
          </div>
          <div className="field">
            <label>Zip</label>
            <input value={form.zip || ''} onChange={e => set('zip', e.target.value)} placeholder="60601" />
          </div>
          <div className="field">
            <label>Website</label>
            <input value={form.website_url || ''} onChange={e => set('website_url', e.target.value)} placeholder="https://..." />
          </div>
          <div className="field full">
            <label>Logo</label>
            <ImageUpload value={form.logo_url || ''} onChange={v => set('logo_url', v)} />
          </div>
          <div className="field full">
            <label>Map Embed</label>
            <textarea
              value={form.map_embed || ''}
              onChange={e => set('map_embed', e.target.value)}
              placeholder="Paste Google Maps iframe embed code..."
              style={{ minHeight: 70 }}
            />
          </div>
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ vendor, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Delete Vendor</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{vendor.vendor_name}</strong>? This cannot be undone.
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

export function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/vendors');
      setVendors(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form) {
    if (modal.vendor?.id) {
      await api.put(`/vendors/${modal.vendor.id}`, form);
    } else {
      await api.post('/vendors', form);
    }
    setModal(null);
    load();
  }

  async function handleDelete() {
    await api.delete(`/vendors/${modal.vendor.id}`);
    setModal(null);
    load();
  }

  async function handleImport(rows) {
    for (const row of rows) {
      await api.post('/vendors', {
        vendor_name: row.vendor_name,
        address:     row.address     || null,
        city:        row.city        || null,
        state:       row.state       || null,
        zip:         row.zip         || null,
        website_url: row.website_url || null,
        logo_url:    row.logo_url    || null,
        map_embed:   null,
      });
    }
    load();
  }

  const existingNames = new Set(vendors.map(v => v.vendor_name.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🏪 Vendors</div>
          <div className="page-subtitle">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setModal({ mode: 'import' })}>
            ↑ Import
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>
            + New Vendor
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : vendors.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🏪</div>
            <p>No vendors yet. Add your first vendor to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Website</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.vendor_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{v.city || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{v.state || '—'}</td>
                    <td>
                      {v.website_url
                        ? <a href={v.website_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent2)' }}>Link</a>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'edit', vendor: v })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setModal({ mode: 'delete', vendor: v })}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal?.mode === 'new' || modal?.mode === 'edit') && (
        <VendorForm
          initial={modal.vendor}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirm
          vendor={modal.vendor}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'import' && (
        <ImportModal
          title="Import Vendors"
          fields={IMPORT_FIELDS}
          nameKey="vendor_name"
          existingNames={existingNames}
          onImport={handleImport}
          onClose={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
