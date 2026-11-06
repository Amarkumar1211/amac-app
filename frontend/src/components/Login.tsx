import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const data = await res.json();
        login(data.token, data.role, data.username, data.department || '');
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', background: '#256b3e', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', padding: '50px 40px', borderRadius: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: 450 }}>

        <div style={{ textAlign: 'center', marginBottom: 25 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 15, marginTop: -10 }}>
            <img src="/logo.png" alt="AMAC Logo" style={{ height: 60, objectFit: 'contain' }} />
          </div>

          <h2 style={{ color: '#1a3b2b', margin: '0 0 5px 0', fontSize: '1.6em', fontWeight: 800 }}>AMAC Production System</h2>
          <p style={{ color: '#888', margin: 0, fontSize: '0.9em' }}>Sign in with your department credentials</p>
        </div>

        {error && <div style={{ background: '#ffebee', color: '#c62828', padding: 10, borderRadius: 4, marginBottom: 20, textAlign: 'center', fontSize: '0.9em' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: '#333', fontSize: '0.85em', fontWeight: 'bold' }}>Username</label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%', padding: '12px 15px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.95em', outline: 'none' }}
              placeholder="Enter your username"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, color: '#333', fontSize: '0.85em', fontWeight: 'bold' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%', padding: '12px 15px', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.95em', outline: 'none' }}
              placeholder="Enter your password"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85em' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#555' }}>
              <input type="checkbox" style={{ accentColor: '#1b5e20', width: 16, height: 16 }} defaultChecked />
              Remember me
            </label>
            <a href="#" style={{ color: '#1b5e20', textDecoration: 'none', fontWeight: 'bold' }}>Need help?</a>
          </div>

          <button type="submit" disabled={loading} style={{ background: '#1b5e20', color: 'white', border: 'none', padding: '14px', borderRadius: 8, fontSize: '1em', cursor: 'pointer', fontWeight: 'bold', marginTop: 10, boxShadow: '0 4px 12px rgba(27, 94, 32, 0.2)' }}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 30, textAlign: 'center', fontSize: '0.8em', color: '#666', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 5px 0' }}>Contact your Admin for login credentials.</p>
          <div style={{ marginTop: 5, color: '#999' }}>Each department has its own dedicated account.</div>
        </div>
      </div>
    </div>
  );
}
