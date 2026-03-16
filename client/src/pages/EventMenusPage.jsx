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
function MenuFormModal({ menu, events, usedEventIds, onSave, onClose }) {
  const [form, setForm] = useState({
    event_id:  menu?.event_id  || '',
    menu_name: menu?.menu_name || '',
    is_active: menu?.is_active !== false,
  });
  const [nameEdited, setNameEdited] = useState(!!menu?.id);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Events available: when creating, exclude events that already have a menu
  const availableEvents = menu
    ? events
    : events.filter(ev => !usedEventIds.has(ev.id));

  function handleEventChange(eventId) {
    setForm(f => {
      const ev = events.find(e => e.id === eventId);
      return {
        ...f,
        event_id: eventId,
        // Auto-fill name if user hasn't typed one yet
        menu_name: (!nameEdited && ev) ? ev.event_name : f.menu_name,
      };
    });
  }

  async function handleSubmit() {
    if (!form.event_id)         { setErr('Event is required.'); return; }
    if (!form.menu_name.trim()) { setErr('Menu name is required.'); return; }
    setSaving(true);
    try {
      const result = menu
        ? await api.put(`/event-menus/${menu.id}`, form)
        : await api.post('/event-menus', form);
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
        <div className="modal-title">{menu ? 'Edit Menu' : 'New Menu'}</div>

        {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="form-grid">
          <div className="field full">
            <label>Event</label>
            <select value={form.event_id} onChange={e => handleEventChange(e.target.value)} autoFocus>
              <option value="">— Select an Event —</option>
              {availableEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.event_name}</option>
              ))}
            </select>
          </div>

          <div className="field full">
            <label>Menu Name</label>
            <input
              value={form.menu_name}
              onChange={e => { setNameEdited(true); setForm(f => ({ ...f, menu_name: e.target.value })); }}
              placeholder="e.g. Saturday Market Menu"
            />
          </div>

          <div className="field full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active (visible on display page)
            </label>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
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

  const filtered = items
    .filter(i =>
      !existingIds.has(i.id) &&
      i.item_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.is_favorite - a.is_favorite);

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
        <div className="modal-title">Add Item from Item Builder</div>
        <div style={{ marginBottom: 12 }}>
          <input
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>
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
                : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🧁</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.is_favorite && <span style={{ color: '#f5a623', marginRight: 4 }}>★</span>}
                  {item.item_name}
                </div>
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
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Menu Detail ───────────────────────────────────────────
function MenuDetail({ menuId, events, onBack, onMenuUpdated }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [savingItem, setSavingItem] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/event-menus/${menuId}`)
      .then(setMenu)
      .catch(e => setErr(e.message))
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
  if (err)     return <div className="error-msg" style={{ margin: 24 }}>{err}</div>;
  if (!menu)   return null;

  const existingIds = new Set((menu.items || []).map(i => i.item_builder_id).filter(Boolean));

  return (
    <div>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPicker(true)}>+ Add Item</button>
        </div>
      </div>

      {(!menu.items || menu.items.length === 0) ? (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 40 }}>🍞</div>
            <p>No items yet. Click "Add Item" to add from Item Builder.</p>
          </div>
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
                    <td style={{ padding: '10px 14px', width: 52 }}>
                      {item.image_url
                        ? <img src={item.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🧁</div>
                      }
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{item.item_name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtPrice(item.retail_price)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing
                        ? <input type="number" min="0" value={editingItem.qty_on_hand}
                            onChange={e => setEditingItem(ei => ({ ...ei, qty_on_hand: parseInt(e.target.value) || 0 }))}
                            style={{ width: 70, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
                        : item.qty_on_hand
                      }
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isEditing
                        ? <input type="number" min="0" value={editingItem.limited_threshold}
                            onChange={e => setEditingItem(ei => ({ ...ei, limited_threshold: parseInt(e.target.value) || 0 }))}
                            style={{ width: 70, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }} />
                        : item.limited_threshold
                      }
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600, background: `${style.color}22`, color: style.color }}>
                        {style.label}
                      </span>
                    </td>
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
                        <RowMenu actions={[
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
        <MenuFormModal
          menu={menu}
          events={events}
          usedEventIds={new Set()}
          onSave={handleMenuSaved}
          onClose={() => setEditing(false)}
        />
      )}
      {showPicker && (
        <ItemPickerModal menuId={menuId} existingIds={existingIds} onAdd={handleItemAdded} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}

// ── Menu List ─────────────────────────────────────────────
export function EventMenusPage() {
  const [menus, setMenus]       = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, e] = await Promise.all([
        api.get('/event-menus'),
        api.get('/events'),
      ]);
      setMenus(m);
      setEvents(e);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
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

      {err && <div className="error-msg" style={{ marginBottom: 16 }}>{err}</div>}

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
                {['Menu', 'Event', 'Items', 'Status', ''].map(h => (
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
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }} onClick={() => setSelectedId(m.id)}>
                    {m.item_count ?? 0}
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={() => setSelectedId(m.id)}>
                    {m.is_active
                      ? <span className="badge badge-green">Active</span>
                      : <span className="badge badge-gray">Inactive</span>
                    }
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <RowMenu actions={[
                      { label: 'Manage', onClick: () => setSelectedId(m.id) },
                      { label: 'Copy Display URL', onClick: () => navigator.clipboard.writeText(publicUrl(m.id)) },
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
        <MenuFormModal
          menu={null}
          events={events}
          usedEventIds={new Set(menus.map(m => m.event_id).filter(Boolean))}
          onSave={handleMenuCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
