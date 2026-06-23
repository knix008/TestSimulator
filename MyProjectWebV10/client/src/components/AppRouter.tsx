import { useAuth } from '../context/AuthContext';
import { LoginPage } from './LoginPage';
import { ProjectView } from './ProjectView';
import './AppRouter.css';

export function AppRouter() {
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

  return <ProjectView />;
}
