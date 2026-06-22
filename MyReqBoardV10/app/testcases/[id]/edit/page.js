"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "../../../../lib/i18n/LanguageContext";

export default function EditTestCasePage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, tcStatusLabel } = useLanguage();
  const [form, setForm] = useState(null);
  const [requirement, setRequirement] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/testcases/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setRequirement(data.requirement);
        setForm({
          code: data.code,
          title: data.title,
          steps: data.steps || "",
          expectedResult: data.expectedResult || "",
          status: data.status,
        });
      });
  }, [id]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/testcases/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "저장에 실패했습니다.");
      return;
    }
    router.push(`/requirements/${requirement.id}`);
  }

  if (!form) return <p>{t("common.loading")}</p>;

  return (
    <div>
      {requirement && (
        <p><Link href={`/requirements/${requirement.id}`}>&larr; {requirement.code}</Link></p>
      )}
      <h2>{t("common.edit")} {t("requirements.testCases")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>{t("common.code")}</label>
          <input value={form.code} onChange={(e) => update("code", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.title")}</label>
          <input value={form.title} onChange={(e) => update("title", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>테스트 절차</label>
          <textarea value={form.steps} onChange={(e) => update("steps", e.target.value)} />
        </div>
        <div className="form-row">
          <label>예상 결과</label>
          <textarea value={form.expectedResult} onChange={(e) => update("expectedResult", e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t("common.status")}</label>
          <select value={form.status} onChange={(e) => update("status", e.target.value)}>
            {["NOT_RUN", "PASS", "FAIL", "BLOCKED"].map((k) => (
              <option key={k} value={k}>{tcStatusLabel(k)}</option>
            ))}
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">{t("common.save")}</button>
      </form>
    </div>
  );
}
