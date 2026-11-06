import React, { useState, useEffect } from 'react';
import { apiFetch } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { KeyRound, Eye, EyeOff, Save, X, RefreshCw } from 'lucide-react';

interface UserAccount {
  id: number;
  username: string;
  role: string;
  department: string;
}

export default function UserAccounts() {
  const { showAlert } = useModal();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/users`);
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (id: number) => {
    if (!newPassword.trim() || newPassword.length < 4) {
      showAlert('Validation', 'Password must be at least 4 characters.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/users/${id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        showAlert('Success', 'Password updated successfully.');
        setEditingId(null);
        setNewPassword('');
      } else {
        showAlert('Error', 'Failed to update password.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    if (role === 'Admin') return { background: '#1a3b2b', color: 'white' };
    return { background: '#e8f3ed', color: '#0b462c' };
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0b462c' }}>User Accounts</h2>
          <p style={{ margin: '5px 0 0', color: '#666', fontSize: '0.9em' }}>
            View all department login accounts and reset passwords.
          </p>
        </div>
        <button className="btn btn-outline" onClick={fetchUsers} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
        <table className="table-fit" style={{ width: '100%', minWidth: 'unset', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Username</th>
              <th>Role</th>
              <th>Department</th>
              <th style={{ width: 280 }}>Reset Password</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30 }}>Loading accounts...</td></tr>
            ) : (
              users.map((u, idx) => (
                <tr key={u.id}>
                  <td style={{ color: '#999', fontSize: '0.85em' }}>{idx + 1}</td>
                  <td style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1em' }}>{u.username}</td>
                  <td>
                    <span className="badge" style={getRoleBadgeStyle(u.role)}>{u.role}</span>
                  </td>
                  <td style={{ color: '#444' }}>{u.department || '— All Access —'}</td>
                  <td>
                    {editingId === u.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showPwd ? 'text' : 'password'}
                            placeholder="New password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            style={{ width: '100%', padding: '6px 30px 6px 10px', borderRadius: 4, border: '1px solid #ddd', fontSize: '0.9em' }}
                            onKeyDown={e => e.key === 'Enter' && handleResetPassword(u.id)}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd(!showPwd)}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#999', display: 'flex' }}
                          >
                            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button
                          className="btn-small"
                          onClick={() => handleResetPassword(u.id)}
                          disabled={saving}
                          style={{ background: '#0b462c', color: 'white', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Save size={13} /> {saving ? '...' : 'Save'}
                        </button>
                        <button
                          className="btn-small"
                          onClick={() => { setEditingId(null); setNewPassword(''); }}
                          style={{ background: '#f5f5f5', color: '#333', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-small"
                        onClick={() => { setEditingId(u.id); setNewPassword(''); setShowPwd(false); }}
                        style={{ background: '#fff3e0', color: '#e65100', display: 'flex', alignItems: 'center', gap: 5 }}
                      >
                        <KeyRound size={13} /> Reset Password
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, padding: 16, background: '#f9f9f9', borderRadius: 8, border: '1px solid #eee', fontSize: '0.85em', color: '#666' }}>
        <strong style={{ color: '#333' }}>Default Passwords (first login):</strong>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px 20px' }}>
          {[
            ['admin', 'admin123'],
            ['production', 'prod123'],
            ['dcf', 'dcf123'],
            ['ut', 'ut123'],
            ['visual1', 'vis1123'],
            ['heattreat', 'ht123'],
            ['owening', 'own123'],
            ['machining', 'mach123'],
            ['visual2', 'vis2123'],
            ['shotblast', 'sb123'],
            ['finalinsp', 'fi123'],
            ['storage', 'stor123'],
            ['dispatch', 'disp123'],
          ].map(([u, p]) => (
            <span key={u}><code style={{ background: '#efefef', padding: '1px 5px', borderRadius: 3 }}>{u}</code> / <code style={{ background: '#efefef', padding: '1px 5px', borderRadius: 3 }}>{p}</code></span>
          ))}
        </div>
      </div>
    </div>
  );
}
