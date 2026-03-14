import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { RecipeTestLogModal } from './RecipeTestLogModal.jsx';

const OUTCOMES = {
  pending:    { label: 'Pending',    color: 'var(--text-muted)' },
  success:    { label: 'Success',    color: 'var(--accent)' },
  needs_work: { label: 'Needs Work', color: '#f59e0b' },
  fail:       { label: 'Fail',       color: 'var(--danger)' },
};

export function TestLogPage() {
  const [tests, setTests]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [activeRecipe, setActiveRecipe] = useState(null); // { id, recipe_name }

  useEffect(() => {
    api.get('/recipes/tests')
      .then(setTests)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  function reload() {
    setLoading(true);
    api.get('/recipes/tests')
      .then(setTests)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Test Log</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tests.length} test{tests.length !== 1 ? 's' : ''} across all recipes</span>
      </div>

      {err && <div className="error-msg" style={{ marginBottom: 16 }}>{err}</div>}

      {tests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧪</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No tests yet</div>
          <div style={{ fontSize: 13 }}>Open any recipe's menu and select Test Log to start tracking.</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Recipe', 'Test #', 'Date', 'Label', 'Outcome', 'Rating', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => {
                const outcome = OUTCOMES[t.outcome] || OUTCOMES.pending;
                return (
                  <tr key={t.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.recipe_name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>#{t.test_number}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t.tested_at ? new Date(t.tested_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.label || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, fontWeight: 600,
                        background: `${outcome.color}22`, color: outcome.color }}>
                        {outcome.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#f59e0b' }}>
                      {t.rating ? '★'.repeat(t.rating) + '☆'.repeat(5 - t.rating) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveRecipe({ id: t.recipe_id, recipe_name: t.recipe_name })}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeRecipe && (
        <RecipeTestLogModal
          recipe={activeRecipe}
          onClose={() => { setActiveRecipe(null); reload(); }}
        />
      )}
    </div>
  );
}
