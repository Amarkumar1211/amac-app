import React, { createContext, useState, useContext } from 'react';

interface AuthContextType {
  token: string | null;
  role: string | null;
  username: string | null;
  department: string | null;
  login: (token: string, role: string, username: string, department: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('role'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('username'));
  const [department, setDepartment] = useState<string | null>(localStorage.getItem('department'));

  const login = (newToken: string, newRole: string, newUsername: string, newDepartment: string) => {
    setToken(newToken);
    setRole(newRole);
    setUsername(newUsername);
    setDepartment(newDepartment);
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    localStorage.setItem('username', newUsername);
    localStorage.setItem('department', newDepartment);
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    setUsername(null);
    setDepartment(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('department');
  };

  return (
    <AuthContext.Provider value={{ token, role, username, department, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  // Normalize URL to relative /api when routing through Vite proxy (supports tunnels and public access)
  let targetUrl = url;
  if (targetUrl.includes(':4900/api/')) {
    targetUrl = targetUrl.replace(/^https?:\/\/[^/]+:4900\/api\//, '/api/');
  }

  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && options.method !== 'GET' && options.method !== 'DELETE') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(targetUrl, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    localStorage.removeItem('department');
    window.location.href = '/';
  }

  return response;
}
