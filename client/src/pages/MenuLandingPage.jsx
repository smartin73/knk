import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE = import.meta.env.VITE_API_URL || '/api';

function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function MenuLandingPage() {
  const navigate = useNavigate();
  const [menus, setMenus] = useState(null);
  const [err, setErr] = useState('');

  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    fetch(`${BASE}/public/menus`)
      .then(r => r.json())
      .then(data => {
        setLogoUrl(data.logo_url || null);
        if (data.redirect) {
          navigate(`/menu/${data.redirect}`, { replace: true });
        } else {
          setMenus(data.menus || []);
        }
      })
      .catch(() => setErr('Could not load menus.'));
  }, []);

  if (!menus && !err) return (
    <div style={{ minHeight: '100vh', background: '#f5f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 16, color: '#888' }}>Loading…</div>
    </div>
  );

  if (err) return (
    <div style={{ minHeight: '100vh', background: '#f5f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 16, color: '#888' }}>{err}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: '#1a1a1a' }}>
        {logoUrl
          ? <img src={logoUrl} alt="Knife & Knead" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
          : <div style={{ padding: '20px 24px', textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: 22, letterSpacing: '-0.3px' }}>Knife & Knead</div>
        }
        <div style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: '8px 24px 12px' }}>Select a menu</div>
      </div>

      {menus.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗒</div>
          <div style={{ fontSize: 16 }}>No active menus right now.</div>
        </div>
      ) : (
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {menus.map(m => {
            const startTime = fmtTime(m.start_time);
            const endTime   = fmtTime(m.end_time);
            const timeStr   = startTime && endTime ? `${startTime} – ${endTime}` : startTime || null;
            const dateStr   = m.event_date
              ? new Date(m.event_date.split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : null;

            return (
              <button
                key={m.id}
                onClick={() => navigate(`/menu/${m.id}`)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '16px 20px', borderRadius: 12,
                  background: '#fff', border: '1px solid #e0dbd5',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a1a' }}>{m.menu_name}</div>
                {m.event_name && <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{m.event_name}</div>}
                {(dateStr || timeStr) && (
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                    {[dateStr, timeStr].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
