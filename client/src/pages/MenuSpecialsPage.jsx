import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

function useWindowWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return w;
}

const BASE = import.meta.env.VITE_API_URL || '/api';

function fmtTime(t) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function SpecialCard({ item }) {
  const isSoldOut = item.status === 'sold_out';
  const isLimited = item.status === 'limited';

  return (
    <div style={{
      borderRadius: 14,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 3px 12px rgba(0,0,0,0.14)',
      position: 'relative',
      opacity: isSoldOut ? 0.7 : 1,
      border: '2px solid #f59e0b',
    }}>
      {/* Photo */}
      <div style={{ position: 'relative', paddingTop: '56%', background: '#f0ece8' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.item_name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>🍞</div>
        }

        {/* Special ribbon */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: '#f59e0b', color: '#fff',
          borderRadius: 4, padding: '3px 9px',
          fontSize: 12, fontWeight: 800, letterSpacing: '0.4px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}>
          ★ TODAY'S SPECIAL
        </div>

        {/* Price badge */}
        {item.retail_price && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            background: '#1a1a1a', color: '#fff',
            borderRadius: '50%', width: 60, height: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}>
            ${parseFloat(item.retail_price).toFixed(2)}
          </div>
        )}

        {/* Sold Out overlay */}
        {isSoldOut && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, lineHeight: 1 }}>✕</div>
              <div style={{ color: '#ff5555', fontSize: 20, fontWeight: 800, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Sold Out</div>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', lineHeight: 1.3 }}>{item.item_name}</div>
          {isLimited && (
            <span style={{ flexShrink: 0, fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>
              ★ Limited
            </span>
          )}
        </div>
        {item.description && (
          <div style={{ fontSize: 14, color: '#666', marginTop: 6, lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </div>
        )}
      </div>
    </div>
  );
}

export function MenuSpecialsPage() {
  const { id } = useParams();
  const width = useWindowWidth();
  const isMobile = width < 520;
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const timerRef = useRef(null);

  async function fetchMenu() {
    try {
      const res = await fetch(`${BASE}/public/menu/${id}/specials`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Menu not found' : 'Failed to load menu');
      const data = await res.json();
      setMenu(data);
      setErr('');

      const interval = (data.refresh_interval || 30) * 1000;
      timerRef.current = setTimeout(fetchMenu, interval);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMenu();
    return () => clearTimeout(timerRef.current);
  }, [id]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f5f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 18, color: '#666' }}>Loading…</div>
    </div>
  );

  if (err) return (
    <div style={{ minHeight: '100vh', background: '#f5f0eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
        <div style={{ fontSize: 18, color: '#333' }}>{err}</div>
      </div>
    </div>
  );

  const fmtDate = menu.event_date
    ? new Date(menu.event_date.split('T')[0] + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  const startTime = fmtTime(menu.start_time);
  const endTime = fmtTime(menu.end_time);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || null;

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a1a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1a1a1a', borderBottom: '2px solid #f59e0b' }}>
        {menu.logo_url
          ? <img src={menu.logo_url} alt="Knife & Knead" style={{ width: '100%', height: 'auto', display: 'block' }} />
          : <div style={{ padding: '14px 24px', color: '#fff', fontWeight: 800, fontSize: isMobile ? 22 : 28, letterSpacing: '-0.5px', textAlign: 'center' }}>Knife & Knead</div>
        }
        {(fmtDate || timeStr) && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '4px 24px 8px' }}>
            {fmtDate && <span style={{ color: '#ccc', fontSize: 12, fontWeight: 500 }}>{fmtDate}</span>}
            {fmtDate && timeStr && <span style={{ color: '#555', fontSize: 12 }}>·</span>}
            {timeStr && <span style={{ color: '#999', fontSize: 12 }}>{timeStr}</span>}
          </div>
        )}
      </div>

      {/* Specials banner */}
      <div style={{
        background: '#f59e0b',
        color: '#fff',
        padding: '10px 24px',
        fontSize: isMobile ? 18 : 22,
        fontWeight: 800,
        textAlign: 'center',
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        ★ Today's Specials ★
      </div>

      {/* Items */}
      {(!menu.items || menu.items.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
          <div style={{ fontSize: 18, color: '#666' }}>No specials right now.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : menu.items.length === 1 ? '1fr' : 'repeat(2, 1fr)',
          gap: isMobile ? 12 : 16,
          padding: isMobile ? '16px 12px 32px' : '20px 24px 40px',
          maxWidth: 800,
          margin: '0 auto',
        }}>
          {menu.items.map(item => <SpecialCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
