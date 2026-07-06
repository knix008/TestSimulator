import { Suspense, lazy } from 'react';
import { useAuth } from '../context/DesktopAuthContext';
import { LoginPage } from '@web/components/LoginPage';
import '@web/components/AppRouter.css';

const DesktopProjectView = lazy(() =>
  import('./DesktopProjectView').then((module) => ({ default: module.DesktopProjectView })),
);

function ProjectViewFallback() {
  return (
    <div className="app-loading">
      <div className="app-loading-spinner" />
      <p>로딩 중…</p>
    </div>
  );
}

export function DesktopAppRouter() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <ProjectViewFallback />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<ProjectViewFallback />}>
      <DesktopProjectView />
    </Suspense>
  );
}
