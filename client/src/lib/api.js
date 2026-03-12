const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(method, path, body, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !opts.silent) {
    window.location.href = '/login';
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  put:    (path, body)   => request('PUT',    path, body),
  delete: (path)         => request('DELETE', path),

  // Auth
  login:  (u, p)  => request('POST', '/auth/login',  { username: u, password: p }),
  logout: ()      => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me', null, { silent: true }),

  // Multipart form POST (no Content-Type header — browser sets boundary)
  formPost: async (path, formData) => {
    const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: formData });
    if (res.status === 401) { window.location.href = '/login'; return; }
    if (!res.ok) { const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || 'Request failed'); }
    return res.json();
  },

  // Upload
  upload: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/upload`, { method: 'POST', credentials: 'include', body: fd });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },
};
