"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "../../../lib/i18n/LanguageContext";

export default function RequirementDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const { t, statusLabel, priorityLabel, tcStatusLabel } = useLanguage();
  const [requirement, setRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  const canEdit = session && (session.user.role === "EDITOR" || session.user.role === "ADMIN");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/requirements/${id}`);
    if (res.ok) setRequirement(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toggle(tcId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  }

  function toggleSelectAll() {
    const testCases = requirement?.testCases || [];
    setSelected((prev) => {
      if (prev.size === testCases.length) return new Set();
      return new Set(testCases.map((tc) => tc.id));
    });
  }

  async function handleDeleteTestCase(tcId) {
    if (!confirm("이 테스트케이스를 삭제할까요?")) return;
    const res = await fetch(`/api/testcases/${tcId}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("삭제에 실패했습니다.");
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건의 테스트케이스를 삭제할까요?`)) return;
    const res = await fetch("/api/testcases", {
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

  if (loading) return <p>{t("common.loading")}</p>;
  if (!requirement) return <p>요구사항을 찾을 수 없습니다.</p>;

  const testCases = requirement.testCases;

  return (
    <div>
      <p><Link href="/requirements">&larr; {t("requirements.title")}</Link></p>
      <h2>{requirement.code} — {requirement.title}</h2>
      <table style={{ marginBottom: 24 }}>
        <tbody>
          <tr><th style={{ width: 140 }}>{t("common.category")}</th><td>{requirement.category || "-"}</td></tr>
          <tr><th>{t("common.priority")}</th><td>{priorityLabel(requirement.priority)}</td></tr>
          <tr><th>{t("common.status")}</th><td>{statusLabel(requirement.status)}</td></tr>
          <tr><th>{t("common.description")}</th><td style={{ whiteSpace: "pre-wrap" }}>{requirement.description || "-"}</td></tr>
          <tr><th>{t("requirements.createdBy")}</th><td>{requirement.createdBy?.name || "-"}</td></tr>
        </tbody>
      </table>

      {canEdit && (
        <p>
          <Link className="btn" href={`/requirements/${requirement.id}/edit`}>{t("common.edit")}</Link>
        </p>
      )}

      <h3>{t("requirements.testCases")}</h3>
      {canEdit && (
        <div className="toolbar">
          <Link className="btn" href={`/requirements/${requirement.id}/testcases/new`}>+ {t("requirements.testCases")}</Link>
          {selected.size > 0 && (
            <button className="danger" onClick={handleDeleteSelected}>
              {t("requirements.deleteSelected")} ({selected.size})
            </button>
          )}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={testCases.length > 0 && selected.size === testCases.length}
                onChange={toggleSelectAll}
                title={t("common.selectAll")}
              />
            </th>
            <th>{t("common.code")}</th>
            <th>{t("common.title")}</th>
            <th>예상결과</th>
            <th>{t("common.status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {testCases.length === 0 && (
            <tr><td colSpan={6}>등록된 테스트케이스가 없습니다.</td></tr>
          )}
          {testCases.map((tc) => (
            <tr key={tc.id}>
              <td>
                <input type="checkbox" checked={selected.has(tc.id)} onChange={() => toggle(tc.id)} />
              </td>
              <td>{tc.code}</td>
              <td>{tc.title}</td>
              <td>{tc.expectedResult || "-"}</td>
              <td><span className="badge">{tcStatusLabel(tc.status)}</span></td>
              <td>
                {canEdit && (
                  <>
                    <Link href={`/testcases/${tc.id}/edit`}>{t("common.edit")}</Link>{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); handleDeleteTestCase(tc.id); }}>{t("common.delete")}</a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
