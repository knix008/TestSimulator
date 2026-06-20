import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api";
import ConnectionPage from "./pages/ConnectionPage";
import DashboardPage from "./pages/DashboardPage";
import RequirementsPage from "./pages/RequirementsPage";

export default function App() {
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
          <NavLink to="/connection">DB 연결</NavLink>
        </nav>
        <div className={`connection-badge ${connected ? "connected" : "disconnected"}`}>
          {connected ? `연결됨: ${database}` : "연결 안 됨"}
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage connected={!!connected} />} />
          <Route path="/requirements" element={<RequirementsPage connected={!!connected} />} />
          <Route path="/connection" element={<ConnectionPage onConnected={refreshStatus} />} />
        </Routes>
      </main>
    </div>
  );
}
