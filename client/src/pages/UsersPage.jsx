import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { RowMenu } from '../components/RowMenu.jsx';

const EMPTY_FORM = { username: '', password: '', role: 'member' };
const ROLES = ['admin', 'finance', 'member'];

// ── Create User Modal ─────────────────────────────────────
function CreateUserModal({ onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.username.trim()) return setErr('Username is required.');
    if (!form.password)        return setErr('Password is required.');
    setErr(''); setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">New User</div>
        <div className="form-grid">
          <div className="field full">
            <label>Username</label>
            <input autoFocus value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. jsmith" />
          </div>
          <div className="field full">
            <label>Temporary Password</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="They can change this after login" />
          </div>
          <div className="field full">
            <label>Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 14 }}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Password Modal ─────────────────────────────────
export function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.current_password || !form.new_password) return setErr('All fields are required.');
    if (form.new_password !== form.confirm) return setErr('New passwords do not match.');
    if (form.new_password.length < 6) return setErr('New password must be at least 6 characters.');
    setErr(''); setSaving(true);
    try {
      await api.put('/users/me/password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setDone(true);
    } catch (e) {
      setErr(e.message || 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-title">Change Password</div>
        {done ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Password changed successfully.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-grid">
              <div className="field full">
                <label>Current Password</label>
                <input autoFocus type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} />
              </div>
              <div className="field full">
                <label>New Password</label>
                <input type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} />
              </div>
              <div className="field full">
                <label>Confirm New Password</label>
                <input type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            </div>
            {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Reset Password Modal (admin) ──────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [form, setForm] = useState({ new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.new_password) return setErr('Password is required.');
    if (form.new_password.length < 6) return setErr('Password must be at least 6 characters.');
    if (form.new_password !== form.confirm) return setErr('Passwords do not match.');
    setErr(''); setSaving(true);
    try {
      await api.put(`/users/${user.id}/password`, { new_password: form.new_password });
      setDone(true);
    } catch (e) {
      setErr(e.message || 'Reset failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-title">Reset Password — {user.username}</div>
        {done ? (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Password reset successfully.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-grid">
              <div className="field full">
                <label>New Password</label>
                <input autoFocus type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} />
              </div>
              <div className="field full">
                <label>Confirm Password</label>
                <input type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            </div>
            {err && <div className="error-msg" style={{ marginTop: 8 }}>{err}</div>}
            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Resetting…' : 'Reset Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Users Page ────────────────────────────────────────────
export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null); // 'create' | 'password' | { mode: 'reset', user }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.get('/users'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(form) {
    await api.post('/users', form);
    setModal(null);
    load();
  }

  async function handleToggleActive(u) {
    await api.put(`/users/${u.id}`, { role: u.role, is_active: !u.is_active });
    load();
  }

  async function handleSetRole(u, role) {
    await api.put(`/users/${u.id}`, { role, is_active: u.is_active });
    load();
  }

  async function handleDelete(u) {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await api.delete(`/users/${u.id}`);
    load();
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">👤 Users</div>
          <div className="page-subtitle">{users.length} user{users.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setModal('password')}>Change My Password</button>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ New User</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = u.id === currentUser?.userId;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.username}</div>
                        {isSelf && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>you</div>}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          background: u.role === 'admin' ? 'var(--accent)' : 'var(--surface2)',
                          color: u.role === 'admin' ? '#fff' : 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
                          background: u.is_active ? 'var(--green-bg, #1a3a1a)' : 'var(--surface2)',
                          color: u.is_active ? 'var(--green, #4caf50)' : 'var(--text-muted)',
                        }}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{fmtDate(u.created_at)}</td>
                      <td>
                        <div className="actions">
                          <RowMenu actions={[
                            ...(u.role === 'member' ? [{ label: 'Make Admin', onClick: () => handleSetRole(u, 'admin') }] : []),
                            ...(u.role === 'admin' && !isSelf ? [{ label: 'Make Member', onClick: () => handleSetRole(u, 'member') }] : []),
                            { label: u.is_active ? 'Deactivate' : 'Activate', onClick: () => handleToggleActive(u) },
                            ...(!isSelf ? [{ label: 'Reset Password', onClick: () => setModal({ mode: 'reset', user: u }) }] : []),
                            ...(!isSelf ? [{ label: 'Delete', onClick: () => handleDelete(u), danger: true }] : []),
                          ]} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'create'                && <CreateUserModal onSave={handleCreate} onCancel={() => setModal(null)} />}
      {modal === 'password'              && <ChangePasswordModal onClose={() => setModal(null)} />}
      {modal?.mode === 'reset'           && <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />}
    </div>
  );
}
