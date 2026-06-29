import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { path: '/', icon: '📊', key: 'dashboard' },
  { path: '/requirements', icon: '📋', key: 'requirements' },
  { path: '/test-cases', icon: '🧪', key: 'testCases' },
  { path: '/users', icon: '👥', key: 'users', adminOnly: true },
  { path: '/reports', icon: '📄', key: 'reports' },
  { path: '/settings', icon: '⚙️', key: 'settings' },
];

export default function Layout({ children }) {
  const { t } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user?.displayName || user?.username}</div>
          <button className="btn btn-sm btn-secondary" style={{ marginTop: 8, width: '100%' }} onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
