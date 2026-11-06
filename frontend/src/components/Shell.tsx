import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, Search, LogOut, Home, ChevronLeft, Hammer, Eye, Flame, Microwave, Cog, ShieldCheck, Truck, BarChart2, Factory, Waves, Tornado, Warehouse, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Map each department name to its route path
const DEPT_ROUTES: Record<string, string> = {
  'Production': '/production',
  'DCF': '/dcf-operations',
  'Decoring': '/dcf-operations',
  'Cutting': '/dcf-operations',
  'Fettling': '/dcf-operations',
  'Filing': '/dcf-operations',
  'Sand Blasting': '/dcf-operations',
  'Quality': '/quality',
  'U5': '/quality',
  'U4B': '/quality',
  'HT & Finishing': '/ht-finishing',
  'Machining': '/third-party-machining',
  'Storage & Dispatch': '/storage-dispatch',
};

export default function Shell() {
  const { role, username, department, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const isDeptUser = role === 'Department' || role === 'Supervisor' || role === 'HOD';

  // Auto-redirect department user to their screen on login
  useEffect(() => {
    if (isDeptUser && department && DEPT_ROUTES[department]) {
      navigate(DEPT_ROUTES[department], { replace: true });
    }
  }, [isDeptUser, department]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`/reports?traceId=${encodeURIComponent(globalSearch.trim())}`);
      setGlobalSearch('');
    }
  };

  return (
    <div className="portal-shell" id="portal-shell">
      {/* TOP UTILITY HEADER */}
      <header className="portal-utility-header">
        <div className="util-left">
          <div className="brand-lockup">
            <img src="/logo.png" alt="AMAC Logo" className="util-logo" />
            <div className="brand-text">
              <h1>
                <span className="brand-title-desktop">ASIAAN METALS &amp; ALUMINIUM CASTING PVT LTD</span>
                <span className="brand-title-mobile">ASIAAN METALS</span>
              </h1>
              <div className="brand-subtitle">
                {isDeptUser && department ? `${department} Department Portal` : 'Production Traceability'}
              </div>
            </div>
          </div>
        </div>
        <div className="util-right">
          {/* Only Admin can use global search */}
          {role === 'Admin' && (
            <form className="util-search" onSubmit={handleSearchSubmit}>
              <Search className="util-search-icon" size={16} />
              <input
                type="text"
                id="portal-search"
                placeholder="Search trace ID..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
              />
              {globalSearch && (
                <button type="button" className="util-search-clear" onClick={() => setGlobalSearch('')}>&times;</button>
              )}
            </form>
          )}
          <div className="util-datestamp">{new Date().toLocaleDateString('en-GB')}</div>
          <div className="util-welcome">
            Welcome, {username || 'User'}
            {isDeptUser && department ? ` (${department} - ${role})` : ` (${role || 'Guest'})`}
          </div>
          <button className="util-logout" onClick={logout}><LogOut size={16} /> Logout</button>
          <button className="mobile-drawer-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* LAYOUT: SIDEBAR + WORKSPACE */}
      <div className="portal-layout">
        {/* Left Vertical Sidebar */}
        <aside className="portal-sidebar" id="portal-sidebar" style={{ width: isSidebarCollapsed ? 70 : 260, transition: 'width 0.2s ease', overflowX: 'hidden' }}>
          <div className="sidebar-header" style={{ display: 'flex', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', alignItems: 'center' }}>
            {!isSidebarCollapsed && <span>{isDeptUser ? 'My Department' : 'Departments'}</span>}
            <button onClick={() => setSidebarCollapsed(!isSidebarCollapsed)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex' }}>
              {isSidebarCollapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
          <div className="sidebar-nav" style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 'calc(100vh - 150px)' }}>

            {/* ── ADMIN SEES EVERYTHING ─────────────────────────── */}
            {role === 'Admin' && (<>
              <NavLink to="/dashboard" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,255,255,0.05)', marginBottom: 5 }}>
                <span className="side-icon"><Home size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Dashboard</span>}
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,255,255,0.05)', marginBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="side-icon"><Shield size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Admin Panel</span>}
              </NavLink>
              <NavLink to="/production" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><Factory size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Production</span>}
              </NavLink>
              <NavLink to="/dcf-operations" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><Hammer size={18} /></span>{!isSidebarCollapsed && <span className="side-label">DCF (Decoring, Cutting, Fettling)</span>}
              </NavLink>
              <NavLink to="/quality" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><ShieldCheck size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Quality</span>}
              </NavLink>
              <NavLink to="/ht-finishing" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><Flame size={18} /></span>{!isSidebarCollapsed && <span className="side-label">HT & Finishing</span>}
              </NavLink>
              <NavLink to="/third-party-machining" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><Cog size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Machining</span>}
              </NavLink>
              <NavLink to="/storage-dispatch" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><Warehouse size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Storage & Dispatch</span>}
              </NavLink>
              <NavLink to="/reports" className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`} style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <span className="side-icon"><BarChart2 size={18} /></span>{!isSidebarCollapsed && <span className="side-label">Reports &amp; Dashboard</span>}
              </NavLink>
            </>)}

            {/* ── DEPARTMENT USER SEES ONLY THEIR SECTION ──────── */}
            {isDeptUser && department && DEPT_ROUTES[department] && (
              <NavLink
                to={DEPT_ROUTES[department]}
                className={({ isActive }) => `sidebar-tab ${isActive ? 'active' : ''}`}
                style={{ textDecoration: 'none', justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', background: 'rgba(255,255,255,0.08)' }}
              >
                <span className="side-icon"><Factory size={18} /></span>
                {!isSidebarCollapsed && <span className="side-label">{department}</span>}
              </NavLink>
            )}

          </div>
        </aside>

        {/* Dynamic Central Workspace */}
        <main className="portal-workspace" id="main-viewport">
          <Outlet />
        </main>
      </div>

      {mobileMenuOpen && (
        <>
          <div className="mobile-drawer-overlay open" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="mobile-drawer open">
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/logo.png" alt="AMAC Logo" style={{ height: 32, filter: 'brightness(0) invert(1)' }} />
                <div style={{ textAlign: 'left' }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#ffffff' }}>AMAC PORTAL</h3>
                  <div style={{ fontSize: 11, opacity: 0.85, color: '#ffffff' }}>
                    {isDeptUser && department ? `${department} Portal` : 'Menu & Navigation'}
                  </div>
                </div>
              </div>
              <button className="mobile-drawer-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
            </div>

            {/* Mobile User Profile Pill */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              padding: '10px 14px',
              margin: '10px 0 14px',
              textAlign: 'left',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}>
              <div style={{ fontSize: 11, opacity: 0.8, color: '#ffffff' }}>Signed in as:</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#86efac' }}>{username || 'User'}</div>
              <div style={{ fontSize: 11, marginTop: 2, color: '#ffffff', opacity: 0.9 }}>
                {isDeptUser && department ? `${department} • ${role}` : role || 'User'}
              </div>
            </div>

            <div className="mobile-drawer-links">
              {role === 'Admin' && (
                <>
                  <NavLink to="/dashboard" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Home size={17} style={{ marginRight: 10 }} /> Dashboard
                  </NavLink>
                  <NavLink to="/admin" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Shield size={17} style={{ marginRight: 10 }} /> Admin Panel
                  </NavLink>
                  <NavLink to="/production" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Factory size={17} style={{ marginRight: 10 }} /> Production
                  </NavLink>
                  <NavLink to="/dcf-operations" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Hammer size={17} style={{ marginRight: 10 }} /> DCF (Decoring, Cutting, Fettling)
                  </NavLink>
                  <NavLink to="/quality" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <ShieldCheck size={17} style={{ marginRight: 10 }} /> Quality
                  </NavLink>
                  <NavLink to="/ht-finishing" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Flame size={17} style={{ marginRight: 10 }} /> HT &amp; Finishing
                  </NavLink>
                  <NavLink to="/third-party-machining" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Cog size={17} style={{ marginRight: 10 }} /> Machining
                  </NavLink>
                  <NavLink to="/storage-dispatch" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <Warehouse size={17} style={{ marginRight: 10 }} /> Storage &amp; Dispatch
                  </NavLink>
                  <NavLink to="/reports" className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                    <BarChart2 size={17} style={{ marginRight: 10 }} /> Reports &amp; Dashboard
                  </NavLink>
                </>
              )}
              {isDeptUser && department && DEPT_ROUTES[department] && (
                <NavLink to={DEPT_ROUTES[department]} className="drawer-link" onClick={() => setMobileMenuOpen(false)}>
                  <Factory size={17} style={{ marginRight: 10 }} /> {department}
                </NavLink>
              )}
            </div>

            {/* Mobile Drawer Logout */}
            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.15)' }}>
              <button
                onClick={() => { setMobileMenuOpen(false); logout(); }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px',
                  background: '#d84343',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
