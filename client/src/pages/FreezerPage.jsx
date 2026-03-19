import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

export function FreezerPage() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingQty, setEditingQty] = useState(null); // { id, value }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/items');
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelta(item, delta) {
    const prev = item.freezer_qty || 0;
    const next = Math.max(0, prev + delta);
    setItems(its => its.map(i => i.id === item.id ? { ...i, freezer_qty: next } : i));
    try {
      await api.patch(`/items/${item.id}/freezer`, { delta });
    } catch {
      setItems(its => its.map(i => i.id === item.id ? { ...i, freezer_qty: prev } : i));
    }
  }

  async function handleSetQty(item, val) {
    const qty = Math.max(0, parseInt(val) || 0);
    setItems(its => its.map(i => i.id === item.id ? { ...i, freezer_qty: qty } : i));
    setEditingQty(null);
    try {
      await api.patch(`/items/${item.id}/freezer`, { qty });
    } catch (e) {
      console.error(e);
      load();
    }
  }

  const filtered = items.filter(i =>
    !search || i.item_name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    // Out of stock to bottom
    if ((a.freezer_qty || 0) === 0 && (b.freezer_qty || 0) > 0) return 1;
    if ((b.freezer_qty || 0) === 0 && (a.freezer_qty || 0) > 0) return -1;
    return a.item_name.localeCompare(b.item_name);
  });

  const total    = items.length;
  const inStock  = items.filter(i => (i.freezer_qty || 0) > 0).length;
  const outOf    = items.filter(i => (i.freezer_qty || 0) === 0).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧊 Freezer Stock</div>
          <div className="page-subtitle">{inStock} of {total} items in stock</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Items', value: total, color: 'var(--text)' },
          { label: 'In Stock',    value: inStock, color: 'var(--success, #4caf82)' },
          { label: 'Out of Stock', value: outOf,  color: outOf > 0 ? 'var(--red, #e55)' : 'var(--text-muted)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 20px', flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          style={{ flex: 1, maxWidth: 320, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }}
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">Loading…</div> : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 48 }}>🧊</div>
            <p>{search ? 'No items match.' : 'No items yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Batch Qty</th>
                  <th style={{ textAlign: 'center' }}>Freezer Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const qty = item.freezer_qty || 0;
                  const isOut = qty === 0;
                  const isEditing = editingQty?.id === item.id;
                  return (
                    <tr key={item.id} style={{ opacity: isOut ? 0.55 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                        {isOut && <div style={{ fontSize: 11, color: 'var(--red, #e55)', fontWeight: 600 }}>OUT OF STOCK</div>}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                        {item.batch_qty || '—'}
                      </td>
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => handleDelta(item, -1)}
                            disabled={qty === 0}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 16, cursor: qty === 0 ? 'not-allowed' : 'pointer', opacity: qty === 0 ? 0.4 : 1 }}>
                            −
                          </button>
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              autoFocus
                              value={editingQty.value}
                              onChange={e => setEditingQty({ id: item.id, value: e.target.value })}
                              onBlur={() => handleSetQty(item, editingQty.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSetQty(item, editingQty.value); if (e.key === 'Escape') setEditingQty(null); }}
                              style={{ width: 52, textAlign: 'center', fontWeight: 700, fontSize: 15, background: 'var(--surface)', border: '1px solid var(--accent2)', borderRadius: 6, padding: '3px 4px', color: 'var(--text)' }}
                            />
                          ) : (
                            <span
                              onClick={() => setEditingQty({ id: item.id, value: String(qty) })}
                              title="Click to set exact quantity"
                              style={{ display: 'inline-block', minWidth: 36, textAlign: 'center', fontWeight: 700, fontSize: 15, cursor: 'pointer', padding: '3px 6px', borderRadius: 6, color: isOut ? 'var(--red, #e55)' : 'var(--text)' }}>
                              {qty}
                            </span>
                          )}
                          <button
                            onClick={() => handleDelta(item, 1)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 16, cursor: 'pointer' }}>
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
