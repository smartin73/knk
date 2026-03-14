import { useState, useEffect, useRef, useCallback } from 'react';
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

function ItemCard({ item }) {
  const isSoldOut = item.status === 'sold_out';
  const isLimited = item.status === 'limited';

  return (
    <div style={{
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      position: 'relative',
      opacity: isSoldOut ? 0.7 : 1,
    }}>
      {/* Photo */}
      <div style={{ position: 'relative', paddingTop: '70%', background: '#f0ece8' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.item_name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🍞</div>
        }

        {/* Price badge */}
        {item.retail_price && (
          <div style={{
            position: 'absolute', bottom: 10, right: 10,
            background: '#1a1a1a', color: '#fff',
            borderRadius: '50%', width: 52, height: 52,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
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
              <div style={{ fontSize: 40, lineHeight: 1 }}>✕</div>
              <div style={{ color: '#ff5555', fontSize: 18, fontWeight: 800, marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Sold Out</div>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{item.item_name}</div>
          {isLimited && (
            <span style={{ flexShrink: 0, fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>
              ★ Limited
            </span>
          )}
        </div>
        {item.description && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 5, lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </div>
        )}
      </div>
    </div>
  );
}

export function MenuDisplayPage() {
  const { id } = useParams();
  const width = useWindowWidth();
  const isMobile = width < 520;
  const isWide = width >= 900;
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const timerRef = useRef(null);

  async function fetchMenu() {
    try {
      const res = await fetch(`${BASE}/public/menu/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Menu not found' : 'Failed to load menu');
      const data = await res.json();
      setMenu(data);
      setErr('');

      // Schedule next refresh
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
      <div style={{ fontSize: 18, color: '#666' }}>Loading menu…</div>
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
    <div style={{ minHeight: '100vh', background: '#f5f0eb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#1a1a1a' }}>
        {menu.logo_url
          ? <img src={menu.logo_url} alt="Knife & Knead" style={{ width: '100%', height: 'auto', display: 'block' }} />
          : <div style={{ padding: isMobile ? '20px 24px' : '28px 40px', color: '#fff', fontWeight: 800, fontSize: isMobile ? 26 : 36, letterSpacing: '-0.5px', textAlign: 'center' }}>Knife & Knead</div>
        }
        {(fmtDate || timeStr) && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '8px 24px 12px' }}>
            {fmtDate && <span style={{ color: '#ccc', fontSize: isMobile ? 12 : 14, fontWeight: 500 }}>{fmtDate}</span>}
            {fmtDate && timeStr && <span style={{ color: '#555', fontSize: 14 }}>·</span>}
            {timeStr && <span style={{ color: '#999', fontSize: isMobile ? 12 : 13 }}>{timeStr}</span>}
          </div>
        )}
      </div>

      {/* Tagline banner */}
      {menu.tagline && (
        <div style={{
          background: menu.tagline_color || '#e85d26',
          color: '#fff',
          padding: '10px 24px',
          fontSize: 16,
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.2px',
        }}>
          {menu.tagline}
        </div>
      )}

      {/* Menu name */}
      <div style={{ padding: isMobile ? '16px 16px 6px' : '20px 24px 8px', fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#1a1a1a', letterSpacing: '-0.4px' }}>
        {menu.menu_name}
      </div>

      {/* Items grid */}
      {(!menu.items || menu.items.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍞</div>
          <div style={{ fontSize: 16 }}>No items on this menu yet.</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : isWide ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: isMobile ? 12 : 16,
          padding: isMobile ? '12px 16px 40px' : '16px 24px 40px',
          maxWidth: 960,
          margin: '0 auto',
        }}>
          {menu.items.map(item => <ItemCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}
