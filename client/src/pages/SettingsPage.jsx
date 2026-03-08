import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';

// ── Default settings definitions ──────────────────────────
// These define what settings exist, their labels, and grouping.
// Values are loaded from the database on top of these.
const SETTINGS_SCHEMA = [
  {
    category: 'Square',
    icon: '◻️',
    settings: [
      { key: 'square_access_token',    label: 'Access Token',      description: 'Square API access token from your Square Developer dashboard.', is_encrypted: true },
      { key: 'square_location_id',     label: 'Location ID',       description: 'Your Square location ID.', is_encrypted: false },
      { key: 'square_environment',     label: 'Environment',       description: 'sandbox or production', is_encrypted: false },
    ],
  },
  {
    category: 'Pushover',
    icon: '🔔',
    settings: [
      { key: 'pushover_api_token',  label: 'API Token',  description: 'Pushover application API token.', is_encrypted: true },
      { key: 'pushover_user_key',   label: 'User Key',   description: 'Your Pushover user key.', is_encrypted: true },
    ],
  },
  {
    category: 'WordPress',
    icon: '🌐',
    settings: [
      { key: 'wordpress_site_url',      label: 'Site URL',        description: 'Your WordPress site URL (e.g. https://knifeandknead.com).', is_encrypted: false },
      { key: 'wordpress_api_key',       label: 'API Key',         description: 'API key for the knk WordPress plugin.', is_encrypted: true },
    ],
  },

{
  category: 'Costing',
  icon: '💰',
  settings: [
    { key: 'packaging_cost',         label: 'Packaging Cost ($)',       description: 'Default packaging cost per item (use your most expensive packaging).', is_encrypted: false },
    { key: 'square_fee_rate',        label: 'In-Person Fee Rate',       description: 'Square in-person rate (e.g. 0.026 = 2.6%).', is_encrypted: false },
    { key: 'square_fee_flat',        label: 'In-Person Flat Fee ($)',   description: 'Square in-person flat fee per transaction (e.g. 0.15).', is_encrypted: false },
    { key: 'square_fee_online_rate', label: 'Online Fee Rate',          description: 'Square online rate (e.g. 0.033 = 3.3%).', is_encrypted: false },
    { key: 'square_fee_online_flat', label: 'Online Flat Fee ($)',      description: 'Square online flat fee per transaction (e.g. 0.30).', is_encrypted: false },
  ],
},

];

// ── Setting Row ───────────────────────────────────────────
function SettingRow({ def, currentValue, onSave }) {
  const [value, setValue]   = useState(currentValue || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [show, setShow]       = useState(false);

  useEffect(() => {
    setValue(currentValue || '');
  }, [currentValue]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(def.key, value, def);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(currentValue || '');
    setEditing(false);
  }

  const hasValue = !!currentValue;
  const isEncrypted = def.is_encrypted;

  return (
    <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{def.label}</div>
            {isEncrypted && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                sensitive
              </span>
            )}
            {hasValue && !editing && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--green-bg, #1a3a1a)', color: 'var(--green, #4caf50)', fontWeight: 600, textTransform: 'uppercase' }}>
                set
              </span>
            )}
            {saved && (
              <span style={{ fontSize: 11, color: 'var(--green, #4caf50)' }}>✓ Saved</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: editing ? 10 : 0 }}>
            {def.description}
          </div>

          {editing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
                <input
                  autoFocus
                  type={isEncrypted && !show ? 'password' : 'text'}
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
                  placeholder={`Enter ${def.label}…`}
                  style={{
                    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '7px 36px 7px 10px', color: 'var(--text)', fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                />
                {isEncrypted && (
                  <button
                    onClick={() => setShow(s => !s)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                  >
                    {show ? '🙈' : '👁'}
                  </button>
                )}
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Cancel</button>
            </div>
          )}

          {!editing && hasValue && isEncrypted && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>
              ••••••••••••••••
            </div>
          )}
          {!editing && hasValue && !isEncrypted && (
            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', marginTop: 4 }}>
              {currentValue}
            </div>
          )}
        </div>

        {!editing && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(true)}
            style={{ marginTop: 2, whiteSpace: 'nowrap' }}
          >
            {hasValue ? 'Update' : 'Set'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────
export function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/settings');
      const map = {};
      rows.forEach(r => { map[r.key] = r.value; });
      setSettings(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(key, value, def) {
    await api.put(`/settings/${key}`, {
      value,
      category: def.category || '',
      label: def.label || '',
      description: def.description || '',
      is_encrypted: def.is_encrypted || false,
    });
    setSettings(s => ({ ...s, [key]: value }));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">⚙️ Settings</div>
          <div className="page-subtitle">API keys and integrations</div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {SETTINGS_SCHEMA.map(group => (
            <div key={group.category} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{group.icon}</span>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{group.category}</div>
              </div>
              <div>
                {group.settings.map(def => (
                  <SettingRow
                    key={def.key}
                    def={def}
                    currentValue={settings[def.key]}
                    onSave={handleSave}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
