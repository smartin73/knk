import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

import LoginPage        from './pages/LoginPage.jsx';
import DashboardPage    from './pages/DashboardPage.jsx';
import { DonationsPage } from './pages/stubs.jsx';
import { EventMenusPage } from './pages/EventMenusPage.jsx';
import { MenuDisplayPage } from './pages/MenuDisplayPage.jsx';
import { MenuLandingPage } from './pages/MenuLandingPage.jsx';
import { EventsPage } from './pages/EventsPage.jsx';
import { VendorsPage } from './pages/VendorsPage.jsx';
import { IngredientsPage } from './pages/IngredientsPage.jsx';
import { RecipesPage } from './pages/RecipesPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { ItemBuilderPage } from './pages/ItemBuilderPage.jsx';
import { TestLogPage } from './pages/TestLogPage.jsx';
import { UsersPage, ChangePasswordModal } from './pages/UsersPage.jsx';

const NAV = [
  { to: '/',               label: 'Dashboard',   icon: '▦' },
  { to: '/recipes',        label: 'Recipes',     icon: '📖' },
  { to: '/ingredients',    label: 'Ingredients', icon: '🧂' },
  { to: '/items',          label: 'Item Builder', icon: '🧁' },
  { to: '/test-log',       label: 'Test Log',    icon: '🧪' },
  { to: '/events',         label: 'Events',      icon: '📅' },
  { to: '/events/vendors', label: 'Vendors',     icon: '🏪' },
  { to: '/menus',          label: 'Event Menus', icon: '🗒' },
  { to: '/donations',      label: 'Donations',   icon: '💛' },
  { to: '/users',          label: 'Users',       icon: '👤', adminOnly: true },
  { to: '/settings',       label: 'Settings',    icon: '⚙️', adminOnly: true },
];

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showChangePw, setShowChangePw] = useState(false);
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span>🔪</span>
          <span>Knife & Knead</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.filter(n => !n.adminOnly || isAdmin).map(n => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <span className="sidebar-user">{user?.username}</span>
            <button
              onClick={() => setShowChangePw(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0, textAlign: 'left' }}
            >
              Change password
            </button>
          </div>
          <button onClick={handleLogout} className="logout-btn">Sign out</button>
        </div>
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
          <Route path="/menu/:id" element={<MenuDisplayPage />} />
          <Route path="/*" element={
            <RequireAuth><Layout /></RequireAuth>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
