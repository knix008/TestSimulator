"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "../../../../../lib/i18n/LanguageContext";

export default function NewTestCasePage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, tcStatusLabel } = useLanguage();
  const [form, setForm] = useState({ code: "", title: "", steps: "", expectedResult: "", status: "NOT_RUN" });
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/testcases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, requirementId: id }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "저장에 실패했습니다.");
      return;
    }
    router.push(`/requirements/${id}`);
  }

  return (
    <div>
      <h2>{t("requirements.testCases")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>{t("common.code")}</label>
          <input value={form.code} onChange={(e) => update("code", e.target.value)} placeholder="TC-001" required />
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
