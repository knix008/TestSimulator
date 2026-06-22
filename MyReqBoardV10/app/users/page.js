"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLanguage } from "../../lib/i18n/LanguageContext";

const EMPTY_NEW_USER = {
  username: "",
  password: "",
  name: "",
  email: "",
  company: "",
  department: "",
  role: "VIEWER",
};

export default function UsersPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER);

  async function load() {
    setLoading(true);
    const [usersRes, requestsRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/registration-requests"),
    ]);
    if (usersRes.ok) setUsers(await usersRes.json());
    if (requestsRes.ok) setRequests(await requestsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "생성에 실패했습니다.");
      return;
    }
    setNewUser(EMPTY_NEW_USER);
    load();
  }

  async function updateUser(id, patch) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) load();
    else alert("수정에 실패했습니다.");
  }

  function handleResetPassword(id, username) {
    const newPassword = prompt(`${username} 계정의 새 비밀번호를 입력하세요.`);
    if (!newPassword) return;
    updateUser(id, { password: newPassword });
  }

  async function handleReviewRequest(id, action) {
    const res = await fetch(`/api/registration-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) load();
    else {
      const data = await res.json();
      alert(data.error || "처리에 실패했습니다.");
    }
  }

  if (session && session.user.role !== "ADMIN") {
    return <p>{t("settings.adminOnly")}</p>;
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <div>
      <h2>{t("users.title")}</h2>

      <h3>{t("users.pendingRequests")}</h3>
      {pendingRequests.length === 0 ? (
        <p>{t("users.noPending")}</p>
      ) : (
        <table style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>{t("common.id")}</th>
              <th>{t("common.name")}</th>
              <th>{t("common.email")}</th>
              <th>{t("common.company")}/{t("common.department")}</th>
              <th>{t("register.requestedRole")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pendingRequests.map((r) => (
              <tr key={r.id}>
                <td>{r.username}</td>
                <td>{r.name}</td>
                <td>{r.email || "-"}</td>
                <td>{[r.company, r.department].filter(Boolean).join(" / ") || "-"}</td>
                <td>{r.requestedRole}</td>
                <td>
                  <button onClick={() => handleReviewRequest(r.id, "approve")}>{t("users.approve")}</button>{" "}
                  <button className="danger" onClick={() => handleReviewRequest(r.id, "reject")}>{t("users.reject")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>{t("users.addUser")}</h3>
      <form onSubmit={handleCreate} className="toolbar" style={{ flexWrap: "wrap" }}>
        <div className="form-row">
          <label>{t("common.id")}</label>
          <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required />
        </div>
        <div className="form-row">
          <label>{t("common.password")}</label>
          <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
        </div>
        <div className="form-row">
          <label>{t("common.name")}</label>
          <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
        </div>
        <div className="form-row">
          <label>{t("common.email")}</label>
          <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t("common.company")}</label>
          <input value={newUser.company} onChange={(e) => setNewUser({ ...newUser, company: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t("common.department")}</label>
          <input value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t("common.role")}</label>
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="VIEWER">VIEWER</option>
            <option value="EDITOR">EDITOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <button type="submit">{t("common.add")}</button>
      </form>
      {error && <p className="error">{error}</p>}

      <h3>{t("users.list")}</h3>
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("common.id")}</th>
              <th>{t("common.name")}</th>
              <th>{t("common.email")}</th>
              <th>{t("common.company")}/{t("common.department")}</th>
              <th>{t("common.role")}</th>
              <th>{t("users.active")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.name}</td>
                <td>{u.email || "-"}</td>
                <td>{[u.company, u.department].filter(Boolean).join(" / ") || "-"}</td>
                <td>
                  <select value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                    <option value="VIEWER">VIEWER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>{u.isActive ? t("users.active") : t("users.inactive")}</td>
                <td>
                  <button
                    className={u.isActive ? "danger" : "secondary"}
                    onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                  >
                    {u.isActive ? t("users.deactivate") : t("users.activate")}
                  </button>{" "}
                  <button className="secondary" onClick={() => handleResetPassword(u.id, u.username)}>
                    {t("users.resetPassword")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
