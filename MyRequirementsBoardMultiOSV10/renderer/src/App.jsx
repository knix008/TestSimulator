import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import Nav from './components/Nav.jsx';
import AppMenuBar from './components/AppMenuBar.jsx';
import AppInfoDialog from './components/AppInfoDialog.jsx';
import ExcelImportDialog from './components/ExcelImportDialog.jsx';
import ExcelExportDialog from './components/ExcelExportDialog.jsx';
import { ExcelImportRouteOpener, ExcelExportRouteOpener } from './components/ExcelRouteOpener.jsx';
import LoginDialog from './components/LoginDialog.jsx';
import { ExcelDialogProvider } from './context/ExcelDialogContext.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import RequirementsPage from './pages/RequirementsPage.jsx';
import RequirementFormPage from './pages/RequirementFormPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import OllamaPage from './pages/OllamaPage.jsx';
import ProjectFileListener from './components/ProjectFileListener.jsx';

function ProtectedRoute({ children, minRole = 'VIEWER' }) {
  const { user, loading, hasRole } = useAuth();
  const { t } = useLanguage();
  if (loading) return <div className="container">{t('common.loading')}</div>;
  if (!user) return null;
  if (!hasRole(minRole)) return <div className="container">{t('common.noPermission')}</div>;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [infoOpen, setInfoOpen] = useState(false);

  if (loading) {
    return <div className="container">{t('common.loading')}</div>;
  }

  return (
    <ExcelDialogProvider>
      {user ? (
        <div className="app-shell">
          <header className="app-header">
            <div className="app-menubar" role="menubar">
              <AppMenuBar onShowInfo={() => setInfoOpen(true)} />
            </div>
            <Nav onShowInfo={() => setInfoOpen(true)} />
          </header>
          <main className="app-main">
            <ProjectFileListener />
            <Routes>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/" element={<ProtectedRoute><RequirementsPage /></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
              <Route path="/requirements/new" element={<ProtectedRoute><RequirementFormPage /></ProtectedRoute>} />
              <Route path="/requirements/:id/edit" element={<ProtectedRoute><RequirementFormPage /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute minRole="ADMIN"><UsersPage /></ProtectedRoute>} />
              <Route path="/ollama" element={<ProtectedRoute minRole="EDITOR"><OllamaPage /></ProtectedRoute>} />
              <Route path="/import" element={<ProtectedRoute><ExcelImportRouteOpener /></ProtectedRoute>} />
              <Route path="/export" element={<ProtectedRoute><ExcelExportRouteOpener /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <>
          <LoginDialog open={!user} />
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </>
      )}
      <AppInfoDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
      <ExcelImportDialog />
      <ExcelExportDialog />
    </ExcelDialogProvider>
  );
}
