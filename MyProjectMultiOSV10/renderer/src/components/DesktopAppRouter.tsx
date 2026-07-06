import { useAuth } from '../context/DesktopAuthContext';
import { LoginPage } from '@web/components/LoginPage';
import { DesktopProjectView } from './DesktopProjectView';
import '@web/components/AppRouter.css';

export function DesktopAppRouter() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
        <p>로딩 중…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DesktopProjectView />;
}
