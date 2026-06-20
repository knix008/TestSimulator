import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ROLE_LABELS } from "../roles";
import { AdminInfo, AppUser, UserRole } from "../types";

const ROLES: UserRole[] = ["admin", "editor", "viewer"];

function AdminSelfSettings({ currentUser, onUpdated }: { currentUser: AppUser; onUpdated: () => Promise<void> }) {
  const [username, setUsername] = useState(currentUser.username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUsername(currentUser.username);
  }, [currentUser.username]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = username.trim();
    if (!trimmed) {
      setError("관리자 ID는 비워둘 수 없습니다.");
      return;
    }
    if (password && password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    try {
      if (trimmed !== currentUser.username) {
        await api.changeUsername(currentUser.id, trimmed);
      }
      if (password) {
        await api.changePassword(currentUser.id, password);
      }
      setPassword("");
      setSuccess(trimmed !== currentUser.username ? "ID와 비밀번호가 변경되었습니다." : "비밀번호가 변경되었습니다.");
      await onUpdated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="form-grid" onSubmit={save}>
      <label>
        관리자 ID
        <input value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        새 비밀번호 (변경하지 않으려면 비워두세요)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
      </label>
      {error && <p className="msg-error full-width">{error}</p>}
      {success && <p className="msg-success full-width">{success}</p>}
      <div className="full-width">
        <button type="submit">저장</button>
      </div>
    </form>
  );
}

export default function AdminPage() {
  const { user: currentUser, token, login } = useAuth();
  const [info, setInfo] = useState<AdminInfo | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("viewer");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [infoResult, usersResult] = await Promise.all([api.getAdminInfo(), api.listUsers()]);
      setInfo(infoResult);
      setUsers(usersResult);
      if (token) {
        login(token, await api.me());
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser(newUsername, newPassword, newRole);
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("이 사용자를 삭제하시겠습니까?")) return;
    try {
      await api.deleteUser(id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function renameUser(id: string, currentUsername: string) {
    const username = prompt("새 사용자 ID를 입력하세요:", currentUsername);
    if (!username || username === currentUsername) return;
    try {
      await api.changeUsername(id, username);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function resetPassword(id: string) {
    const password = prompt("새 비밀번호를 입력하세요 (6자 이상):");
    if (!password) return;
    try {
      await api.changePassword(id, password);
      alert("비밀번호가 변경되었습니다.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function changeRole(id: string, role: UserRole) {
    try {
      await api.changeRole(id, role);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="card">
        <p>이 페이지는 관리자만 볼 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="msg-error">{error}</p>}

      {info && (
        <div className="card">
          <h2>서버 정보</h2>
          <div className="info-grid">
            <div>
              <span className="info-label">DB 종류</span>
              <span>{info.connection.provider ?? "연결 안 됨"}</span>
            </div>
            <div>
              <span className="info-label">DB / 파일</span>
              <span>{info.connection.database ?? "-"}</span>
            </div>
            <div>
              <span className="info-label">요구사항 수</span>
              <span>{info.counts.requirements}</span>
            </div>
            <div>
              <span className="info-label">테스트 케이스 수</span>
              <span>{info.counts.testCases}</span>
            </div>
            <div>
              <span className="info-label">테스트 실행 기록 수</span>
              <span>{info.counts.testRuns}</span>
            </div>
            <div>
              <span className="info-label">사용자 수</span>
              <span>
                {info.counts.users} (관리자 {info.counts.usersByRole.admin} / 편집자 {info.counts.usersByRole.editor} / 조회자{" "}
                {info.counts.usersByRole.viewer})
              </span>
            </div>
            <div>
              <span className="info-label">Node.js 버전</span>
              <span>{info.server.nodeVersion}</span>
            </div>
            <div>
              <span className="info-label">서버 가동 시간</span>
              <span>{Math.floor(info.server.uptimeSeconds / 60)}분</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>서버 관리 콘솔</h2>
        <p className="hint">
          데이터베이스 연결 설정, 서버 관리자 계정(ID/비밀번호) 변경, 사용자 추가·삭제는{" "}
          <a href="http://localhost:4000/admin" target="_blank" rel="noreferrer">
            서버 관리 콘솔 (/admin)
          </a>
          에서 합니다. 최초 DB 미연결 시 기본 부트스트랩 로그인은 <strong>admin / admin</strong> 입니다.
        </p>
      </div>

      <div className="card">
        <h2>관리자 계정 설정</h2>
        <p className="hint">현재 로그인한 관리자 계정의 ID와 비밀번호를 변경합니다.</p>
        <AdminSelfSettings currentUser={currentUser} onUpdated={refresh} />
      </div>

      <div className="card">
        <h2>사용자 관리</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>사용자 ID</th>
              <th>권한</th>
              <th>생성일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>
                  <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as UserRole)} disabled={u.id === currentUser.id}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(u.createdUtc).toLocaleString()}</td>
                <td className="row-actions">
                  <button onClick={() => renameUser(u.id, u.username)}>ID 변경</button>
                  <button onClick={() => resetPassword(u.id)}>비밀번호 변경</button>
                  <button disabled={u.id === currentUser.id} onClick={() => removeUser(u.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>사용자 추가</h3>
        <form className="form-grid" onSubmit={createUser}>
          <label>
            사용자 ID
            <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
          </label>
          <label>
            비밀번호
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
          </label>
          <label>
            권한
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="full-width">
            <button type="submit">추가</button>
          </div>
        </form>
      </div>
    </div>
  );
}
