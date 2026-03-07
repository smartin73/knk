import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

// Pages (stubs — each module fills these in)
import LoginPage        from './pages/LoginPage.jsx';
import DashboardPage    from './pages/DashboardPage.jsx';
import { RecipesPage, IngredientsPage, ItemBuilderPage, EventMenusPage, DonationsPage } from './pages/stubs.jsx';
import { EventsPage } from './pages/EventsPage.jsx';

const NAV = [
  { to: '/',            label: 'Dashboard',    icon: '▦' },
  { to: '/recipes',     label: 'Recipes',      icon: '📖' },
  { to: '/ingredients', label: 'Ingredients',  icon: '🧂' },
  { to: '/items',       label: 'Item Builder', icon: '🧁' },
  { to: '/events',      label: 'Events',       icon: '📅' },
  { to: '/menus',       label: 'Event Menus',  icon: '🗒' },
  { to: '/donations',   label: 'Donations',    icon: '💛' },
];

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span>🔪</span>
          <span>Knife & Knead</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.map(n => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <span className="sidebar-user">{user?.username}</span>
          <button onClick={handleLogout} className="logout-btn">Sign out</button>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route index              element={<DashboardPage />} />
          <Route path="recipes/*"   element={<RecipesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="items"       element={<ItemBuilderPage />} />
          <Route path="events/*"    element={<EventsPage />} />
          <Route path="menus/*"     element={<EventMenusPage />} />
          <Route path="donations"   element={<DonationsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <RequireAuth><Layout /></RequireAuth>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
