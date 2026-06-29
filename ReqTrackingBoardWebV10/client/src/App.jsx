import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import RequirementsPage from './pages/RequirementsPage';
import TestCasesPage from './pages/TestCasesPage';
import UsersPage from './pages/UsersPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

function PrivateRoute({ children, adminOnly }) {
  const { user, loading, isAdmin, needsSetup } = useAuth();
  if (loading) return <div className="empty-state" style={{ minHeight: '100vh' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (needsSetup) return <Navigate to="/setup" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function SetupRoute() {
  const { user, loading, needsSetup } = useAuth();
  if (loading) return <div className="empty-state" style={{ minHeight: '100vh' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!needsSetup) return <Navigate to="/" replace />;
  return <SetupPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupRoute />} />
      <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/requirements" element={<PrivateRoute><RequirementsPage /></PrivateRoute>} />
      <Route path="/test-cases" element={<PrivateRoute><TestCasesPage /></PrivateRoute>} />
      <Route path="/users" element={<PrivateRoute adminOnly><UsersPage /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
