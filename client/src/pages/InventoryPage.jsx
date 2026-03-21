import { useState } from 'react';
import { api } from '../lib/api.js';

function fmt(n) {
  return n == null ? '—' : Number(n).toLocaleString();
}
function fmtCurrency(n) {
  return n == null ? '—' : `$${parseFloat(n).toFixed(2)}`;
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function defaultRange() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 13);
  const fmt = d => d.toISOString().split('T')[0];
  return { start: fmt(today), end: fmt(end) };
}

export function InventoryPage() {
  const defaults = defaultRange();
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd]     = useState(defaults.end);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [plan, setPlan]       = useState(null);

  async function handleGenerate() {
    if (!start || !end) return setError('Select a start and end date.');
    if (start > end) return setError('Start must be before end.');
    setError(''); setLoading(true); setPlan(null);
    try {
      const data = await api.get(`/inventory/baking-plan?start=${start}&end=${end}`);
      setPlan(data);
    } catch (e) {
      setError(e.message || 'Failed to generate plan.');
    } finally {
      setLoading(false);
    }
  }

  const totalCost = plan?.shopping_list
    .filter(r => r.estimated_cost != null)
    .reduce((sum, r) => sum + parseFloat(r.estimated_cost), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">📦 Inventory Planner</div>
          <div className="page-subtitle">Baking plan and shopping list for a date range</div>
        </div>
      </div>

      {/* Date range form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Start Date</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>End Date</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }} />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Plan'}
          </button>
        </div>
        {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {plan && (
        <>
          {/* Events summary */}
          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            {plan.events.length === 0
              ? `No events found between ${fmtDate(start)} and ${fmtDate(end)}.`
              : <>
                  <strong style={{ color: 'var(--text)' }}>{plan.events.length} event{plan.events.length !== 1 ? 's' : ''}</strong>
                  {' '}found: {plan.events.map(e => e.event_name).join(', ')}
                </>
            }
          </div>

          {/* Baking Plan */}
          <div className="card" style={{ padding: 0, marginBottom: 20 }}>
            <div style={{ padding: '14px 20px', fontWeight: 700, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              Baking Plan
            </div>
            {plan.baking_plan.length === 0 ? (
              <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
                All items are covered by inventory — nothing to bake.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Needed</th>
                      <th style={{ textAlign: 'right' }}>In Inventory</th>
                      <th style={{ textAlign: 'right' }}>Deficit</th>
                      <th style={{ textAlign: 'right' }}>Batch Size</th>
                      <th style={{ textAlign: 'right' }}>Batches to Bake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.baking_plan.map(row => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 600 }}>{row.item_name}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(row.total_qty_needed)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(row.inventory_qty)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(row.deficit)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(row.batch_qty)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent2)' }}>{fmt(row.batches_needed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Shopping List */}
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 20px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
              Shopping List
            </div>
            {plan.shopping_list.length === 0 ? (
              <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
                No ingredients to purchase.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th style={{ textAlign: 'right' }}>Grams Needed</th>
                      <th style={{ textAlign: 'right' }}>Package Size</th>
                      <th>Unit Label</th>
                      <th style={{ textAlign: 'right' }}>Units to Buy</th>
                      <th style={{ textAlign: 'right' }}>Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.shopping_list.map(row => (
                      <tr key={row.ingredient_id}>
                        <td style={{ fontWeight: 600 }}>{row.ingredient_name}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13 }}>{fmt(row.total_grams)}g</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 13 }}>
                          {row.grams_per_unit ? `${fmt(row.grams_per_unit)}g` : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.unit_label || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent2)' }}>
                          {row.units_needed ?? '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtCurrency(row.estimated_cost)}</td>
                      </tr>
                    ))}
                    {totalCost != null && plan.shopping_list.some(r => r.estimated_cost != null) && (
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={5} style={{ fontWeight: 700, textAlign: 'right' }}>Total Estimated Cost</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCurrency(totalCost)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
