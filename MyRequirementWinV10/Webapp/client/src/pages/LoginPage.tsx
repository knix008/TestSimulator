import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.login(username, password);
      login(token, user);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={submit}>
        <h2>ReqTrace Web 로그인</h2>
        <label>
          사용자 ID
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="msg-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "로그인 중..." : "로그인"}
        </button>
        <p className="login-hint">서버에 처음 연결한 경우 기본 관리자 계정(admin / admin123)으로 로그인한 뒤 비밀번호를 변경하세요.</p>
      </form>
    </div>
  );
}
