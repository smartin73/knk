import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { ImportModal } from './ImportModal.jsx';
import { RowMenu } from '../components/RowMenu.jsx';

const EMPTY_FORM = {
  item_name: '',
  purchase_from: '',
  grams: '',
  current_price: '',
};

// Import field definitions for Ingredients
const IMPORT_FIELDS = [
  { key: 'item_name',     label: 'Item Name',          required: true  },
  { key: 'purchase_from', label: 'Purchase From',       required: false },
  { key: 'grams',         label: 'Package Size (grams)', required: false },
  { key: 'current_price', label: 'Current Price ($)',   required: false },
];

function fmt4(n) {
  if (n === null || n === undefined || n === '') return '—';
  return parseFloat(n).toFixed(4);
}

function fmtCurrency(n) {
  if (n === null || n === undefined || n === '') return '—';
  return `$${parseFloat(n).toFixed(2)}`;
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Detail Modal ──────────────────────────────────────────
function IngredientDetail({ ingredient, onEdit, onClose }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    api.get(`/ingredients/${ingredient.id}`)
      .then(data => setHistory(data.price_history || []))
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [ingredient.id]);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{ingredient.item_name}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: 24 }}>
          <DetailRow label="Purchase From" value={ingredient.purchase_from} />
          <DetailRow label="Package Size" value={ingredient.grams ? `${ingredient.grams}g` : null} />
          <DetailRow label="Current Price" value={fmtCurrency(ingredient.current_price)} />
          <DetailRow label="Cost Per Gram" value={ingredient.cost_per_gram ? `$${fmt4(ingredient.cost_per_gram)}` : null} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>Price History</div>
          {loadingHistory ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No price history yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Price</th>
                    <th>Cost/gram</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td>{fmtDateTime(h.recorded_at)}</td>
                      <td>{fmtCurrency(h.price)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {ingredient.grams && h.price
                          ? `$${(parseFloat(h.price) / parseFloat(ingredient.grams)).toFixed(4)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onEdit}>Edit</button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text)' : 'var(--text-muted)' }}>{value || '—'}</div>
    </div>
  );
}

// ── Ingredient Form ───────────────────────────────────────
function IngredientForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.item_name.trim()) return setErr('Item name is required.');
    setErr(''); setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const costPerGram = form.grams && form.current_price
    ? (parseFloat(form.current_price) / parseFloat(form.grams)).toFixed(4)
    : null;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{initial?.id ? 'Edit Ingredient' : 'New Ingredient'}</div>

        <div className="form-grid">
          <div className="field full">
            <label>Item Name</label>
            <input value={form.item_name} onChange={e => set('item_name', e.target.value)} placeholder="e.g. Bread Flour" />
          </div>
          <div className="field full">
            <label>Purchase From</label>
            <input value={form.purchase_from || ''} onChange={e => set('purchase_from', e.target.value)} placeholder="e.g. Restaurant Depot, Amazon" />
          </div>
          <div className="field">
            <label>Package Size (grams)</label>
            <input type="number" step="0.0001" value={form.grams || ''} onChange={e => set('grams', e.target.value)} placeholder="e.g. 2267" />
          </div>
          <div className="field">
            <label>Current Price ($)</label>
            <input type="number" step="0.01" value={form.current_price || ''} onChange={e => set('current_price', e.target.value)} placeholder="0.00" />
          </div>
          {costPerGram && (
            <div className="field full">
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '9px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
                Cost per gram: <strong style={{ color: 'var(--text)' }}>${costPerGram}</strong>
              </div>
            </div>
          )}
        </div>

        {err && <div className="error-msg" style={{ marginTop: 12 }}>{err}</div>}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Ingredient'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────
function DeleteConfirm({ ingredient, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">Delete Ingredient</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{ingredient.item_name}</strong>? This cannot be undone.
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

// ── Ingredients Page ──────────────────────────────────────
export function IngredientsPage() {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [modal, setModal]             = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/ingredients');
      setIngredients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = ingredients.filter(i =>
    !search || i.item_name.toLowerCase().includes(search.toLowerCase()) ||
    (i.purchase_from || '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(form) {
    if (modal.ingredient?.id) {
      await api.put(`/ingredients/${modal.ingredient.id}`, form);
    } else {
      await api.post('/ingredients', form);
    }
    setModal(null);
    load();
  }

  async function handleDelete() {
    await api.delete(`/ingredients/${modal.ingredient.id}`);
    setModal(null);
    load();
  }

  function handleDuplicate(ingredient) {
    setModal({
      mode: 'new',
      ingredient: { ...ingredient, id: undefined, item_name: `Copy of ${ingredient.item_name}` },
    });
  }

  async function handleImport(rows) {
    for (const row of rows) {
      await api.post('/ingredients', {
        item_name:     row.item_name,
        purchase_from: row.purchase_from || null,
        grams:         row.grams         ? parseFloat(row.grams)         : null,
        current_price: row.current_price ? parseFloat(row.current_price) : null,
      });
    }
    load();
  }

  const existingNames = new Set(ingredients.map(i => i.item_name.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧂 Ingredients</div>
          <div className="page-subtitle">{ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setModal({ mode: 'import' })}>
            ↑ Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })}>
            + New Ingredient
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          style={{ flex: 1, maxWidth: 320, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          placeholder="Search ingredients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🧂</div>
            <p>{search ? 'No ingredients match your search.' : 'No ingredients yet. Add your first ingredient to get started.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Purchase From</th>
                  <th>Package Size</th>
                  <th>Price</th>
                  <th>Cost/gram</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id}>
                    <td>
                      <div
                        style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--accent2)' }}
                        onClick={() => setModal({ mode: 'detail', ingredient: i })}
                      >
                        {i.item_name}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{i.purchase_from || '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{i.grams ? `${i.grams}g` : '—'}</td>
                    <td>{fmtCurrency(i.current_price)}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                      {i.cost_per_gram ? `$${fmt4(i.cost_per_gram)}` : '—'}
                    </td>
                    <td>
                      <div className="actions">
                        <RowMenu actions={[
                          { label: 'Edit',      onClick: () => setModal({ mode: 'edit', ingredient: i }) },
                          { label: 'Duplicate', onClick: () => handleDuplicate(i) },
                          { label: 'Delete',    onClick: () => setModal({ mode: 'delete', ingredient: i }), danger: true },
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
        <IngredientDetail
          ingredient={modal.ingredient}
          onEdit={() => setModal({ mode: 'edit', ingredient: modal.ingredient })}
          onClose={() => setModal(null)}
        />
      )}
      {(modal?.mode === 'new' || modal?.mode === 'edit') && (
        <IngredientForm
          initial={modal.ingredient}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'delete' && (
        <DeleteConfirm
          ingredient={modal.ingredient}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'import' && (
        <ImportModal
          title="Import Ingredients"
          fields={IMPORT_FIELDS}
          nameKey="item_name"
          existingNames={existingNames}
          onImport={handleImport}
          onClose={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
