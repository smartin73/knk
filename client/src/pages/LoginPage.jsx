import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const BASE = import.meta.env.VITE_API_URL || '/api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [logoUrl, setLogoUrl]   = useState(null);

  useEffect(() => {
    fetch(`${BASE}/public/branding`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.logo_url) setLogoUrl(d.logo_url); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {logoUrl
          ? <img src={logoUrl} alt="Knife & Knead" style={{ width: '100%', maxWidth: 320, height: 'auto', display: 'block', margin: '0 auto 16px', borderRadius: 6 }} />
          : <><div className="login-logo">🔪</div><div className="login-title">Knife & Knead</div></>
        }
        <div className="login-sub">Sign in to continue</div>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
