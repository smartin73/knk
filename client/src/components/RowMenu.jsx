import { useState, useEffect, useRef } from 'react';

export function RowMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, right: 0 });
  const btnRef  = useRef();
  const menuRef = useRef();

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  }

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        ref={btnRef}
        className="btn btn-secondary btn-sm"
        onClick={handleOpen}
        style={{ padding: '4px 10px', fontWeight: 700, letterSpacing: 1 }}
      >
        ···
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: pos.top, right: pos.right,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000, minWidth: 130, overflow: 'hidden',
          }}
        >
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick(); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', fontSize: 13, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                color: action.danger ? 'var(--red, #e55)' : 'var(--text)',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
