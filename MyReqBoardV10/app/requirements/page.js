"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function RequirementsPage() {
  const { data: session } = useSession();
  const { t, statusLabel, priorityLabel } = useLanguage();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canEdit = session && (session.user.role === "EDITOR" || session.user.role === "ADMIN");

  async function load() {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const res = await fetch(`/api/requirements?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) {
      setItems([]);
      setError(data?.error || "목록을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((r) => r.id));
    });
  }

  async function handleDelete(id) {
    if (!confirm("이 요구사항과 연결된 테스트케이스가 모두 삭제됩니다. 계속할까요?")) return;
    const res = await fetch(`/api/requirements/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("삭제에 실패했습니다.");
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건의 요구사항과 연결된 테스트케이스가 모두 삭제됩니다. 계속할까요?`)) return;
    const res = await fetch("/api/requirements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected) }),
    });
    if (res.ok) {
      setSelected(new Set());
      load();
    } else {
      alert("삭제에 실패했습니다.");
    }
  }

  function goExportSelected() {
    if (selected.size === 0) {
      window.location.href = "/export";
      return;
    }
    window.location.href = `/api/export?ids=${Array.from(selected).join(",")}`;
  }

  if (!session) return null;

  return (
    <div>
      <h2>{t("requirements.title")}</h2>

      <div className="toolbar">
        <div className="form-row">
          <label>{t("common.search")}</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="code/title/category" />
        </div>
        <div className="form-row">
          <label>{t("common.status")}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("common.all")}</option>
            {["DRAFT", "APPROVED", "IN_PROGRESS", "DONE"].map((k) => (
              <option key={k} value={k}>{statusLabel(k)}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>{t("common.priority")}</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t("common.all")}</option>
            {["LOW", "MEDIUM", "HIGH"].map((k) => (
              <option key={k} value={k}>{priorityLabel(k)}</option>
            ))}
          </select>
        </div>
        <button onClick={load}>{t("common.search")}</button>
        <button className="secondary" onClick={goExportSelected}>
          {t("requirements.exportSelected")} ({selected.size})
        </button>
        {canEdit && selected.size > 0 && (
          <button className="danger" onClick={handleDeleteSelected}>
            {t("requirements.deleteSelected")} ({selected.size})
          </button>
        )}
        {canEdit && <Link className="btn" href="/requirements/new">{t("requirements.new")}</Link>}
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleSelectAll}
                  title={t("common.selectAll")}
                />
              </th>
              <th>{t("common.code")}</th>
              <th>{t("common.title")}</th>
              <th>{t("common.category")}</th>
              <th>{t("common.priority")}</th>
              <th>{t("common.status")}</th>
              <th>{t("requirements.testCases")}</th>
              <th>{t("requirements.createdBy")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td><Link href={`/requirements/${r.id}`}>{r.code}</Link></td>
                <td>{r.title}</td>
                <td>{r.category || "-"}</td>
                <td>{priorityLabel(r.priority)}</td>
                <td><span className="badge">{statusLabel(r.status)}</span></td>
                <td>{r._count?.testCases ?? 0}</td>
                <td>{r.createdBy?.name || "-"}</td>
                <td>
                  {canEdit && (
                    <>
                      <Link href={`/requirements/${r.id}/edit`}>{t("common.edit")}</Link>{" "}
                      <a href="#" onClick={(e) => { e.preventDefault(); handleDelete(r.id); }}>{t("common.delete")}</a>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
