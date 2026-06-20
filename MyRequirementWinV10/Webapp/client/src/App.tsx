import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import AdminPage from "./pages/AdminPage";
import { ROLE_LABELS } from "./roles";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RequirementsPage from "./pages/RequirementsPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { token, user, logout } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [database, setDatabase] = useState<string | null>(null);

  async function refreshStatus() {
    const status = await api.getConnectionStatus();
    setConnected(status.connected);
    setDatabase(status.database);
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>ReqTrace Web</h1>
        <nav>
          <NavLink to="/" end>
            대시보드
          </NavLink>
          <NavLink to="/requirements">요구사항 / 테스트 케이스</NavLink>
          {user?.role === "admin" && <NavLink to="/admin">관리</NavLink>}
        </nav>
        <div className={`connection-badge ${connected ? "connected" : "disconnected"}`}>
          {connected ? `서버 DB 연결됨: ${database}` : "서버가 DB에 연결되지 않음"}
        </div>
        {user && (
          <div className="user-badge">
            {user.username} ({ROLE_LABELS[user.role]})
            <button onClick={logout}>로그아웃</button>
          </div>
        )}
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage connected={!!connected} />
              </RequireAuth>
            }
          />
          <Route
            path="/requirements"
            element={
              <RequireAuth>
                <RequirementsPage connected={!!connected} />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
