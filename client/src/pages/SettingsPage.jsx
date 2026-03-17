import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { ImageUpload } from '../components/ImageUpload.jsx';

// ── Default settings definitions ──────────────────────────
// These define what settings exist, their labels, and grouping.
// Values are loaded from the database on top of these.
const SQUARE_FIELDS = [
  { env: 'sandbox',    key: 'square_sandbox_token',          label: 'Sandbox Access Token',    description: 'Token from Square Developer dashboard (sandbox app).', is_encrypted: true,  category: 'Square' },
  { env: 'sandbox',    key: 'square_sandbox_location_id',    label: 'Sandbox Location ID',     description: 'Location ID from your Square sandbox account.',         is_encrypted: false, category: 'Square' },
  { env: 'production', key: 'square_production_token',       label: 'Production Access Token', description: 'Token from Square Developer dashboard (production app).', is_encrypted: true,  category: 'Square' },
  { env: 'production', key: 'square_production_location_id', label: 'Production Location ID',  description: 'Location ID from your Square production account.',         is_encrypted: false, category: 'Square' },
  { env: 'production', key: 'square_production_app_id',      label: 'Production Application ID', description: 'Application ID from your Square production app (for webhooks).', is_encrypted: false, category: 'Square' },
  { env: 'production', key: 'square_webhook_key',            label: 'Webhook Signature Key',     description: 'Signature key from Square Developer → Webhooks (used to verify incoming webhook events).', is_encrypted: true, category: 'Square' },
];

const SETTINGS_SCHEMA = [
  {
    category: 'Pushover',
    icon: '🔔',
    settings: [
      { key: 'pushover_api_token',  label: 'API Token',  description: 'Pushover application API token.', is_encrypted: true },
      { key: 'pushover_user_key',   label: 'User Key',   description: 'Your Pushover user key.', is_encrypted: true },
    ],
  },
  {
    category: 'Gemini',
    icon: '✨',
    settings: [
      { key: 'gemini_api_key', label: 'API Key', description: 'Google Gemini API key for recipe card image import. Get a free key at aistudio.google.com.', is_encrypted: true },
    ],
  },
  {
    category: 'WordPress',
    icon: '🌐',
    settings: [
      { key: 'wordpress_site_url',        label: 'Site URL',               description: 'Your WordPress site URL (e.g. https://knifeandknead.com).', is_encrypted: false },
      { key: 'wordpress_api_key',         label: 'API Key',                description: 'API key for the knk WordPress plugin (used to push events).', is_encrypted: true },
      { key: 'woo_consumer_key',          label: 'WooCommerce Consumer Key',    description: 'WooCommerce REST API consumer key (WooCommerce → Settings → Advanced → REST API).', is_encrypted: true },
      { key: 'woo_consumer_secret',       label: 'WooCommerce Consumer Secret', description: 'WooCommerce REST API consumer secret.', is_encrypted: true },
    ],
  },

{
  category: 'Cloudinary',
  icon: '☁️',
  settings: [
    { key: 'cloudinary_cloud_name',    label: 'Cloud Name',    description: 'Your Cloudinary cloud name (found in the Cloudinary dashboard).', is_encrypted: false },
    { key: 'cloudinary_upload_preset', label: 'Upload Preset', description: 'Unsigned upload preset name from Cloudinary Settings → Upload → Upload presets.', is_encrypted: false },
  ],
},
{
  category: 'Branding',
  icon: '🎨',
  settings: [
    { key: 'logo_url', label: 'Logo / Banner', description: 'Shown on the login page, admin sidebar, and public menu display pages. Recommended: 800×200px.', is_encrypted: false, type: 'image' },
    { key: 'sold_out_image_url', label: 'Sold Out Image', description: 'Full-screen image shown on the menu display page when every item on the menu is sold out. Recommended: 1920×1080px landscape.', is_encrypted: false, type: 'image' },
  ],
},
{
  category: 'Event Menus',
  icon: '🗒',
  settings: [
    { key: 'menu_refresh_interval', label: 'Display Refresh Interval (seconds)', description: 'How often the public menu display page auto-refreshes. Default: 30.', is_encrypted: false },
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
            <div style={{ marginTop: 8 }}>
              {def.type === 'image' ? (
                <div>
                  <ImageUpload value={value} onChange={v => setValue(v)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleCancel}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

// ── Square Section ────────────────────────────────────────
function SquareSection({ settings, onSave }) {
  const env = settings.square_environment || 'sandbox';

  async function setEnv(val) {
    await onSave('square_environment', val, {
      key: 'square_environment', category: 'Square', label: 'Environment',
      description: 'Active Square environment.', is_encrypted: false,
    });
  }

  const groups = [
    { envKey: 'sandbox',    label: '🧪 Sandbox',    fields: SQUARE_FIELDS.filter(f => f.env === 'sandbox') },
    { envKey: 'production', label: '⚡ Production',  fields: SQUARE_FIELDS.filter(f => f.env === 'production') },
  ];

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>◻️</span>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Square</div>
      </div>

      {/* Environment toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>Active Environment</span>
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 6, padding: 3, gap: 2 }}>
          {[
            { val: 'sandbox',    label: '🧪 Sandbox' },
            { val: 'production', label: '⚡ Production' },
          ].map(({ val, label }) => (
            <button key={val} onClick={() => setEnv(val)} style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: env === val ? (val === 'production' ? 'var(--success, #4caf82)' : 'var(--accent)') : 'transparent',
              color: env === val ? '#fff' : 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'background 0.15s',
            }}>
              {label}
            </button>
          ))}
        </div>
        {env === 'production' && (
          <span style={{ fontSize: 11, color: 'var(--warning, #e8a13a)', fontWeight: 700, letterSpacing: '0.5px' }}>● LIVE</span>
        )}
      </div>

      {/* Credential groups */}
      {groups.map(group => (
        <div key={group.envKey} style={{ marginBottom: 8, opacity: env === group.envKey ? 1 : 0.45, transition: 'opacity 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, borderTop: '1px solid var(--border)', marginBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 0 2px' }}>
              {group.label}
            </div>
            {env === group.envKey && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--accent)', color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>active</span>
            )}
          </div>
          {group.fields.map(def => (
            <SettingRow key={def.key} def={def} currentValue={settings[def.key]} onSave={onSave} />
          ))}
        </div>
      ))}
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
          <SquareSection settings={settings} onSave={handleSave} />
          {SETTINGS_SCHEMA.map(group => (
            <div key={group.category} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>{group.icon}</span>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{group.category}</div>
              </div>
              <div>
                {group.settings.map(def => (
                  <SettingRow key={def.key} def={def} currentValue={settings[def.key]} onSave={handleSave} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
