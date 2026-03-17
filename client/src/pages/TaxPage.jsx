import { useState } from 'react';
import { api } from '../lib/api.js';

function priorMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return new Date(y, parseInt(mo, 10) - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function downloadBase64Pdf(base64, filename) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function TaxPage() {
  const [month,     setMonth]     = useState(priorMonth());
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [err,       setErr]       = useState('');

  async function handlePreview() {
    setLoading(true); setErr(''); setPreview(null); setSent(false);
    try {
      const data = await api.get(`/tax/preview?month=${month}`);
      setPreview(data);
    } catch (e) {
      setErr(e.message || 'Preview failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    setSending(true); setErr(''); setSent(false);
    try {
      await api.post('/tax/send', { month });
      setSent(true);
    } catch (e) {
      setErr(e.message || 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">🧾 Tax Filing</div>
          <div className="page-subtitle">Rhode Island T-204 (STR) and T-204M (MTM) — auto-sent on the 1st of each month</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Generate Forms</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
              Month
            </label>
            <input
              type="month"
              value={month}
              onChange={e => { setMonth(e.target.value); setPreview(null); setSent(false); }}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handlePreview}
            disabled={loading}
            style={{ alignSelf: 'flex-end' }}
          >
            {loading ? 'Generating…' : 'Preview'}
          </button>
        </div>

        {err && <div className="error-msg" style={{ marginBottom: 16 }}>{err}</div>}

        {preview && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{monthLabel(preview.month)}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Gross Sales',   value: `$${parseFloat(preview.gross_sales).toFixed(2)}` },
                { label: 'Tax Due',       value: '$0.00 (exempt)' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadBase64Pdf(preview.str_pdf, `RI-STR-${preview.month}.pdf`)}
              >
                Download T-204 (STR)
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadBase64Pdf(preview.mtm_pdf, `RI-MTM-${preview.month}.pdf`)}
              >
                Download T-204M (MTM)
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending || sent}
              >
                {sending ? 'Sending…' : sent ? '✓ Sent' : 'Send by Email'}
              </button>
              {sent && (
                <span style={{ fontSize: 13, color: 'var(--green, #4caf50)', fontWeight: 600 }}>
                  Forms emailed successfully.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Auto-send</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Forms are automatically generated and emailed on the <strong>1st of each month at 9am</strong> for the prior month.
          Configure SMTP credentials and business info in{' '}
          <a href="/settings" style={{ color: 'var(--accent)' }}>Settings → Tax Filing</a>.
        </div>
      </div>
    </div>
  );
}
