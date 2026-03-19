export function SearchInput({ value, onChange, placeholder = 'Search…', style = {}, autoFocus }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: style.flex, width: style.width, maxWidth: style.maxWidth ?? 320 }}>
      <input
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '8px 30px 8px 12px',
          color: 'var(--text)',
          fontSize: 14,
          ...style,
          width: '100%',
          flex: undefined,
          maxWidth: undefined,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 6,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 2px',
          }}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
