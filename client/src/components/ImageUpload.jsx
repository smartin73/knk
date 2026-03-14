import { useState, useRef } from 'react';
import { api } from '../lib/api.js';

// Module-level cache — only fetches once per page load
let _configPromise = null;
async function getCloudinaryConfig() {
  if (!_configPromise) {
    _configPromise = api.get('/settings').then(rows => {
      const map = {};
      rows.forEach(r => { map[r.key] = r.value; });
      return {
        cloudName:    map.cloudinary_cloud_name    || '',
        uploadPreset: map.cloudinary_upload_preset || '',
      };
    }).catch(() => ({ cloudName: '', uploadPreset: '' }));
  }
  return _configPromise;
}

// Apply Cloudinary optimization transforms to a secure_url
function optimizeUrl(url) {
  if (!url || !url.includes('cloudinary.com/')) return url;
  return url.replace('/upload/', '/upload/w_1000,f_auto,q_auto/');
}

export function ImageUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const { cloudName, uploadPreset } = await getCloudinaryConfig();
      let url;

      if (cloudName && uploadPreset) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', uploadPreset);
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: 'POST', body: fd }
        );
        if (!res.ok) throw new Error('Cloudinary upload failed');
        const data = await res.json();
        url = optimizeUrl(data.secure_url);
      } else {
        // Fallback: upload to local server
        const fd = new FormData();
        fd.append('file', file);
        const data = await api.formPost('/upload', fd);
        url = data.url;
      }

      onChange(url);
    } catch {
      setErr('Upload failed — please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      {value && (
        <img
          src={value}
          alt="preview"
          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 8, display: 'block', border: '1px solid var(--border)' }}
        />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => inputRef.current.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : value ? 'Change' : 'Upload Image'}
        </button>
        {value && (
          <>
            <input
              type="text"
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="https://..."
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onChange('')}
              style={{ color: 'var(--red)', flexShrink: 0 }}
            >
              ✕
            </button>
          </>
        )}
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{err}</div>}
    </div>
  );
}
