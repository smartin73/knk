import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { RowMenu } from '../components/RowMenu.jsx';

// ── Helpers ───────────────────────────────────────────────
function computeStatus(item) {
  if (item.qty_on_hand === 0) return 'sold_out';
  if (item.qty_on_hand <= item.limited_threshold) return 'limited';
  return 'available';
}

const STATUS_STYLES = {
  available: { label: 'Available', color: 'var(--accent)' },
  limited:   { label: '★ Limited',  color: '#f59e0b' },
  sold_out:  { label: 'Sold Out',   color: 'var(--danger)' },
};

function fmtPrice(p) {
  if (p == null) return '—';
  return `$${parseFloat(p).toFixed(2)}`;
}

function publicUrl(id) {
  return `${window.location.origin}/menu/${id}`;
}

// ── Menu Form Modal ───────────────────────────────────────
function MenuFormModal({ menu, events, onSave, onClose }) {
  const [form, setForm] = useState({
    event_id:     menu?.event_id     || '',
    menu_name:    menu?.menu_name    || '',
    tagline:      menu?.tagline      || '',
    tagline_color: menu?.tagline_color || '#e85d26',
    is_active:    menu?.is_active    !== false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.menu_name.trim()) { setErr('Menu name is required.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, event_id: form.event_id || null };
      const result = menu
        ? await api.put(`/event-menus/${menu.id}`, payload)
        : await api.post('/event-menus', payload);
      onSave(result);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{menu ? 'Edit Menu' : 'New Menu'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div className="error-msg">{err}</div>}

          <div>
            <label className="form-label">Event (optional)</label>
            <select className="form-input" value={form.event_id} onChange={e => set('event_id', e.target.value)}>
              <option value="">— No Event —</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.event_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Menu Name *</label>
            <input className="form-input" value={form.menu_name} onChange={e => set('menu_name', e.target.value)} placeholder="e.g. Saturday Market Menu" />
          </div>

          <div>
            <label className="form-label">Tagline</label>
            <input className="form-input" value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="e.g. Fresh-baked sourdough and pastries" />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Tagline Color</label>
              <input className="form-input" value={form.tagline_color} onChange={e => set('tagline_color', e.target.value)} placeholder="#e85d26" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <input type="color" value={form.tagline_color} onChange={e => set('tagline_color', e.target.value)}
                style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--surface2)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <label htmlFor="is_active" style={{ fontSize: 13 }}>Active (visible on display page)</label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Item Picker Modal ─────────────────────────────────────
function ItemPickerModal({ menuId, existingIds, onAdd, onClose }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    api.get('/items').then(setItems).catch(console.error);
  }, []);

  const filtered = items.filter(i =>
    !existingIds.has(i.id) &&
    i.item_name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd(item) {
    setAdding(item.id);
    try {
      const result = await api.post(`/event-menus/${menuId}/items`, {
        item_builder_id: item.id,
        qty_on_hand: 0,
        limited_threshold: 3,
      });
      onAdd({ ...result, item_name: item.item_name, description: item.description, retail_price: item.retail_price, image_url: item.image_url });
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2 className="modal-title">Add Item from Item Builder</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 24px 24px' }}>
          <input
            className="form-input"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ marginBottom: 12 }}
          />
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {items.length === 0 ? 'Loading…' : 'No items match'}
              </div>
            )}
            {filtered.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)' }}>
                {item.image_url
                  ? <img src={item.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--surface3)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🧁</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtPrice(item.retail_price)}</div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={adding === item.id}
                  onClick={() => handleAdd(item)}
                >
                  {adding === item.id ? '…' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Menu Detail ───────────────────────────────────────────
function MenuDetail({ menuId, events, onBack, onMenuUpdated }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // { id, qty_on_hand, limited_threshold }
  const [savingItem, setSavingItem] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/event-menus/${menuId}`)
      .then(setMenu)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [menuId]);

  useEffect(() => { load(); }, [load]);

  function handleMenuSaved(updated) {
    setMenu(m => ({ ...m, ...updated }));
    setEditing(false);
    onMenuUpdated(updated);
  }

  function handleItemAdded(item) {
    setMenu(m => ({ ...m, items: [...(m.items || []), item] }));
  }

  async function handleRemoveItem(itemId) {
    await api.delete(`/event-menus/${menuId}/items/${itemId}`);
    setMenu(m => ({ ...m, items: m.items.filter(i => i.id !== itemId) }));
  }

  async function saveItemEdit(item) {
    setSavingItem(item.id);
    try {
      const updated = await api.put(`/event-menus/${menuId}/items/${item.id}`, {
        qty_on_hand:       item.qty_on_hand,
        limited_threshold: item.limited_threshold,
        sort_order:        item.sort_order,
      });
      setMenu(m => ({ ...m, items: m.items.map(i => i.id === item.id ? { ...i, ...updated } : i) }));
      setEditingItem(null);
    } finally {
      setSavingItem(null);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl(menuId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (!menu) return null;

  const existingIds = new Set((menu.items || []).map(i => i.item_builder_id).filter(Boolean));

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          <div>
            <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {menu.menu_name}
              {menu.is_active
                ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>ACTIVE</span>
                : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 700 }}>INACTIVE</span>
              }
            </div>
            {menu.event_name && <div className="page-subtitle">{menu.event_name}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={copyUrl}>
            {copied ? '✓ Copied!' : '🔗 Copy Display URL'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit Menu</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPicker(true)}>+ Add Item</button>
        </div>
      </div>

      {/* Tagline preview */}
      {menu.tagline && (
        <div style={{ background: menu.tagline_color || '#e85d26', color: '#fff', padding: '8px 20px', borderRadius: 8, marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
          {menu.tagline}
        </div>
      )}

      {/* Items table */}
      {(!menu.items || menu.items.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🍞</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No items yet</div>
          <div style={{ fontSize: 13 }}>Click "Add Item" to add items from the Item Builder.</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['', 'Item', 'Price', 'Qty on Hand', 'Limited At', 'Status', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menu.items.map((item, idx) => {
                const status = computeStatus(item);
                const style = STATUS_STYLES[status];
                const isEditing = editingItem?.id === item.id;

                return (
                  <tr key={item.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                    {/* Photo */}
                    <td style={{ padding: '10px 14px', width: 52 }}>
                      {item.image_url
                        ? <img src={item.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🧁</div>
                      }
                    </td>
                    {/* Name */}
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{item.item_name}</td>
                    {/* Price */}
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtPrice(item.retail_price)}</td>
                    {/* Qty */}
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing
                        ? <input type="number" min="0" value={editingItem.qty_on_hand}
                            onChange={e => setEditingItem(ei => ({ ...ei, qty_on_hand: parseInt(e.target.value) || 0 }))}
                            style={{ width: 70, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
                        : item.qty_on_hand
                      }
                    </td>
                    {/* Limited threshold */}
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing
                        ? <input type="number" min="0" value={editingItem.limited_threshold}
                            onChange={e => setEditingItem(ei => ({ ...ei, limited_threshold: parseInt(e.target.value) || 0 }))}
                            style={{ width: 70, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
                        : item.limited_threshold
                      }
                    </td>
                    {/* Status */}
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600, background: `${style.color}22`, color: style.color }}>
                        {style.label}
                      </span>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" disabled={savingItem === item.id}
                            onClick={() => saveItemEdit(editingItem)}>
                            {savingItem === item.id ? '…' : 'Save'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>Cancel</button>
                        </div>
                      ) : (
                        <RowMenu items={[
                          { label: 'Edit Qty', onClick: () => setEditingItem({ id: item.id, qty_on_hand: item.qty_on_hand, limited_threshold: item.limited_threshold, sort_order: item.sort_order }) },
                          { label: 'Remove', danger: true, onClick: () => handleRemoveItem(item.id) },
                        ]} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MenuFormModal menu={menu} events={events} onSave={handleMenuSaved} onClose={() => setEditing(false)} />
      )}
      {showPicker && (
        <ItemPickerModal menuId={menuId} existingIds={existingIds} onAdd={item => { handleItemAdded(item); }} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

// ── Menu List ─────────────────────────────────────────────
export function EventMenusPage() {
  const [menus, setMenus]       = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, e] = await Promise.all([
      api.get('/event-menus'),
      api.get('/events'),
    ]);
    setMenus(m);
    setEvents(e);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleMenuCreated(menu) {
    setMenus(ms => [menu, ...ms]);
    setCreating(false);
    setSelectedId(menu.id);
  }

  function handleMenuUpdated(updated) {
    setMenus(ms => ms.map(m => m.id === updated.id ? { ...m, ...updated } : m));
  }

  async function handleDelete(id) {
    await api.delete(`/event-menus/${id}`);
    setMenus(ms => ms.filter(m => m.id !== id));
  }

  if (selectedId) {
    return (
      <MenuDetail
        menuId={selectedId}
        events={events}
        onBack={() => setSelectedId(null)}
        onMenuUpdated={handleMenuUpdated}
      />
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🗒 Event Menus</div>
          <div className="page-subtitle">Create display menus for events</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Menu</button>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : menus.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 40 }}>🗒</div>
            <p>No menus yet. Create one to get started.</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Menu</button>
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Menu', 'Event', 'Tagline', 'Items', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {menus.map((m, idx) => (
                <tr key={m.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }} onClick={() => setSelectedId(m.id)}>
                    {m.menu_name}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }} onClick={() => setSelectedId(m.id)}>
                    {m.event_name || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setSelectedId(m.id)}>
                    {m.tagline
                      ? <span style={{ color: m.tagline_color || '#e85d26', fontWeight: 600 }}>{m.tagline}</span>
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }} onClick={() => setSelectedId(m.id)}>
                    {m.item_count ?? 0}
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={() => setSelectedId(m.id)}>
                    {m.is_active
                      ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>Active</span>
                      : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 700 }}>Inactive</span>
                    }
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <RowMenu items={[
                      { label: 'Manage', onClick: () => setSelectedId(m.id) },
                      { label: 'Copy Display URL', onClick: () => { navigator.clipboard.writeText(publicUrl(m.id)); } },
                      { label: 'Delete', danger: true, onClick: () => handleDelete(m.id) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <MenuFormModal menu={null} events={events} onSave={handleMenuCreated} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
