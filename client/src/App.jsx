import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

const BASE = import.meta.env.VITE_API_URL || '/api';

import LoginPage        from './pages/LoginPage.jsx';
import DashboardPage    from './pages/DashboardPage.jsx';
import { DonationsPage } from './pages/DonationsPage.jsx';
import { EventMenusPage } from './pages/EventMenusPage.jsx';
import { MenuDisplayPage } from './pages/MenuDisplayPage.jsx';
import { MenuLandingPage } from './pages/MenuLandingPage.jsx';
import { MenuSpecialsPage } from './pages/MenuSpecialsPage.jsx';
import { EventsPage } from './pages/EventsPage.jsx';
import { VendorsPage } from './pages/VendorsPage.jsx';
import { IngredientsPage } from './pages/IngredientsPage.jsx';
import { RecipesPage } from './pages/RecipesPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { ItemBuilderPage } from './pages/ItemBuilderPage.jsx';
import { TestLogPage } from './pages/TestLogPage.jsx';
import { UsersPage, ChangePasswordModal } from './pages/UsersPage.jsx';
import { FinancePage } from './pages/FinancePage.jsx';
import { TaxPage } from './pages/TaxPage.jsx';
import { InventoryPage } from './pages/InventoryPage.jsx';
import { FreezerPage } from './pages/FreezerPage.jsx';

const NAV = [
  { to: '/',               label: 'Dashboard',   icon: '▦' },
  { to: '/recipes',        label: 'Recipes',     icon: '📖' },
  { to: '/ingredients',    label: 'Ingredients', icon: '🧂' },
  { to: '/items',          label: 'Item Builder', icon: '🧁' },
  { to: '/test-log',       label: 'Test Log',    icon: '🧪' },
  { to: '/events',         label: 'Events',      icon: '📅' },
  { to: '/events/vendors', label: 'Vendors',     icon: '🏪' },
  { to: '/menus',          label: 'Event Menus', icon: '🗒' },
  { to: '/freezer',        label: 'Freezer',           icon: '🧊' },
  { to: '/inventory',     label: 'Inventory Planner', icon: '📦' },
  { to: '/donations',      label: 'Donations',   icon: '💛' },
  { to: '/finance',        label: 'Income & Expenses', icon: '💰', financeOnly: true },
  { to: '/tax',            label: 'Tax Filing',        icon: '🧾', adminOnly: true },
  { to: '/users',          label: 'Users',       icon: '👤', adminOnly: true },
  { to: '/settings',       label: 'Settings',    icon: '⚙️', adminOnly: true },
];

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function NavLinks({ isAdmin, isFinance, onClick }) {
  return (
    <>
      <ul className="sidebar-nav">
        {NAV.filter(n => (!n.adminOnly || isAdmin) && (!n.financeOnly || isFinance)).map(n => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''} onClick={onClick}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showChangePw, setShowChangePw] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const isAdmin   = user?.role === 'admin';
  const isFinance = user?.role === 'admin' || user?.role === 'finance';

  useEffect(() => {
    fetch(`${BASE}/public/branding`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.logo_url) setLogoUrl(d.logo_url); })
      .catch(() => {});
  }, []);

  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const footer = (
    <div className="sidebar-footer">
      <div className="sidebar-footer-user">
        <span className="sidebar-user">{user?.username}</span>
        <button
          onClick={() => { setShowChangePw(true); setNavOpen(false); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0, textAlign: 'left' }}
        >
          Change password
        </button>
      </div>
      <button onClick={handleLogout} className="logout-btn">Sign out</button>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Mobile header */}
      <header className="mobile-header">
        <div className="sidebar-logo" style={{ padding: 0, border: 'none' }}>
          {logoUrl
            ? <img src={logoUrl} alt="Knife & Knead" style={{ height: 32, width: 'auto', display: 'block' }} />
            : <><span>🔪</span><span>Knife & Knead</span></>
          }
        </div>
        <button className="hamburger" onClick={() => setNavOpen(v => !v)} aria-label="Menu">☰</button>
      </header>

      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          {logoUrl
            ? <img src={logoUrl} alt="Knife & Knead" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} />
            : <><span>🔪</span><span>Knife & Knead</span></>
          }
        </div>
        <NavLinks isAdmin={isAdmin} isFinance={isFinance} />
        {footer}
      </nav>

      {/* Mobile nav drawer */}
      <div className={`nav-drawer-backdrop${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} />
      <nav className={`nav-drawer${navOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">
          {logoUrl
            ? <img src={logoUrl} alt="Knife & Knead" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} />
            : <><span>🔪</span><span>Knife & Knead</span></>
          }
        </div>
        <NavLinks isAdmin={isAdmin} onClick={() => setNavOpen(false)} />
        {footer}
      </nav>

      <main className="main-content">
        <Routes>
          <Route index              element={<DashboardPage />} />
          <Route path="recipes/*"   element={<RecipesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="items"       element={<ItemBuilderPage />} />
          <Route path="test-log"    element={<TestLogPage />} />
          <Route path="events/*"    element={<EventsPage />} />
          <Route path="events/vendors" element={<VendorsPage />} />
          <Route path="menus/*"     element={<EventMenusPage />} />
          <Route path="donations"   element={<DonationsPage />} />
          <Route path="finance"     element={<FinancePage />} />
          <Route path="tax"         element={<TaxPage />} />
          <Route path="freezer"     element={<FreezerPage />} />
          <Route path="inventory"   element={<InventoryPage />} />
          <Route path="users"       element={<UsersPage />} />
          <Route path="settings"    element={<SettingsPage />} />
        </Routes>
      </main>
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/menu" element={<MenuLandingPage />} />
          <Route path="/menu/specials" element={<MenuLandingPage specials />} />
          <Route path="/menu/:id/specials" element={<MenuSpecialsPage />} />
          <Route path="/menu/:id" element={<MenuDisplayPage />} />
          <Route path="/*" element={
            <RequireAuth><Layout /></RequireAuth>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
