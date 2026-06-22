"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function DbConnectForm() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const isBootstrap = session?.user?.id === "bootstrap";
  const [form, setForm] = useState({ host: "localhost", port: "3306", database: "", user: "", password: "" });
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/db")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        if (data.config) setForm((prev) => ({ ...prev, ...data.config }));
      });
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleConnect(e) {
    e.preventDefault();
    setError("");
    setLog("");
    setBusy(true);
    const res = await fetch("/api/settings/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "DB 접속에 실패했습니다.");
      return;
    }
    setStatus({ connected: true, schemaReady: data.schemaReady });
  }

  async function handleInit() {
    setError("");
    setLog("");
    setBusy(true);
    const res = await fetch("/api/settings/db/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "테이블 생성에 실패했습니다.");
      setLog(data.detail || "");
      return;
    }
    setLog((data.log || "완료되었습니다.") + "\n\n최초 생성 시 admin / admin 계정이 자동으로 만들어집니다.");
    setStatus((prev) => ({ ...prev, connected: true, schemaReady: true }));
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <form onSubmit={handleConnect}>
        <div className="form-row">
          <label>{t("connectDb.host")}</label>
          <input value={form.host} onChange={(e) => update("host", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("connectDb.port")}</label>
          <input value={form.port} onChange={(e) => update("port", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("connectDb.database")}</label>
          <input value={form.database} onChange={(e) => update("database", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.id")}</label>
          <input value={form.user} onChange={(e) => update("user", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.password")}</label>
          <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? t("common.processing") : t("connectDb.connect")}</button>
      </form>

      {status?.connected && (
        <div style={{ marginTop: 20 }}>
          {status.schemaReady ? (
            <>
              <p className="success">접속되었습니다. 테이블이 준비되어 있습니다.</p>
              {isBootstrap && (
                <>
                  <p>DB 설정이 끝났습니다. 실제 계정으로 다시 로그인해야 정상적으로 사용할 수 있습니다.</p>
                  <button onClick={() => signOut({ callbackUrl: "/login" })}>다시 로그인</button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="error">접속은 되었지만 필요한 테이블이 없습니다. 아래 버튼으로 생성하세요.</p>
              <button className="secondary" onClick={handleInit} disabled={busy}>
                {busy ? t("common.processing") : t("connectDb.initTables")}
              </button>
            </>
          )}
        </div>
      )}
      {log && (
        <div style={{ marginTop: 12 }}>
          <pre style={{ background: "#fff", padding: 12, whiteSpace: "pre-wrap" }}>{log}</pre>
          {isBootstrap && <button onClick={() => signOut({ callbackUrl: "/login" })}>다시 로그인</button>}
        </div>
      )}
    </div>
  );
}
