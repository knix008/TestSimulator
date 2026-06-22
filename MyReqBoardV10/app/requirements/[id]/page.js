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

  async function handleDeleteTestCase(tcId) {
    if (!confirm("이 테스트케이스를 삭제할까요?")) return;
    const res = await fetch(`/api/testcases/${tcId}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("삭제에 실패했습니다.");
  }

  if (loading) return <p>{t("common.loading")}</p>;
  if (!requirement) return <p>요구사항을 찾을 수 없습니다.</p>;

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
        <p>
          <Link className="btn" href={`/requirements/${requirement.id}/testcases/new`}>+ {t("requirements.testCases")}</Link>
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>{t("common.code")}</th>
            <th>{t("common.title")}</th>
            <th>예상결과</th>
            <th>{t("common.status")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {requirement.testCases.length === 0 && (
            <tr><td colSpan={5}>등록된 테스트케이스가 없습니다.</td></tr>
          )}
          {requirement.testCases.map((tc) => (
            <tr key={tc.id}>
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
