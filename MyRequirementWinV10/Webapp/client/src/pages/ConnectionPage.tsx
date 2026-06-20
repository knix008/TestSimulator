import { useState } from "react";
import { api } from "../api";
import { ConnectionSettings, DbProvider } from "../types";

const DEFAULT_PORTS: Record<DbProvider, number> = {
  mysql: 3306,
  mariadb: 3306,
  postgresql: 5432,
  sqlite: 0,
  mssql: 1433
};

const PROVIDER_LABELS: Record<DbProvider, string> = {
  mysql: "MySQL",
  mariadb: "MariaDB",
  postgresql: "PostgreSQL",
  sqlite: "SQLite3",
  mssql: "MS SQL Server"
};

export default function ConnectionPage({ onConnected }: { onConnected: () => void }) {
  const [settings, setSettings] = useState<ConnectionSettings>({
    provider: "mysql",
    server: "localhost",
    port: 3306,
    database: "reqtrace",
    username: "",
    password: "",
    sqliteFilePath: ""
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function update<K extends keyof ConnectionSettings>(key: K, value: ConnectionSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function onProviderChange(provider: DbProvider) {
    setSettings((s) => ({ ...s, provider, port: DEFAULT_PORTS[provider] }));
  }

  async function handleConnect() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.connect(settings);
      if (result.success) {
        setMessage({ type: "success", text: "데이터베이스에 연결되었습니다. 필요한 테이블이 없으면 자동으로 생성되었습니다." });
        onConnected();
      } else {
        setMessage({ type: "error", text: result.error ?? "연결에 실패했습니다." });
      }
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const isSqlite = settings.provider === "sqlite";

  return (
    <div className="card">
      <h2>데이터베이스 연결</h2>
      <div className="form-grid">
        <label>
          데이터베이스 종류
          <select value={settings.provider} onChange={(e) => onProviderChange(e.target.value as DbProvider)}>
            {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {!isSqlite && (
          <>
            <label>
              서버
              <input value={settings.server} onChange={(e) => update("server", e.target.value)} />
            </label>
            <label>
              포트
              <input
                type="number"
                value={settings.port}
                onChange={(e) => update("port", Number(e.target.value))}
              />
            </label>
            <label>
              데이터베이스
              <input value={settings.database} onChange={(e) => update("database", e.target.value)} />
            </label>
            <label>
              사용자
              <input value={settings.username} onChange={(e) => update("username", e.target.value)} />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={settings.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </label>
          </>
        )}

        {isSqlite && (
          <label>
            파일 경로
            <input
              placeholder="예: D:\\data\\reqtrace.db"
              value={settings.sqliteFilePath}
              onChange={(e) => update("sqliteFilePath", e.target.value)}
            />
          </label>
        )}
      </div>

      <button disabled={busy} onClick={handleConnect}>
        {busy ? "연결 중..." : "연결"}
      </button>

      {message && <p className={message.type === "success" ? "msg-success" : "msg-error"}>{message.text}</p>}
    </div>
  );
}
