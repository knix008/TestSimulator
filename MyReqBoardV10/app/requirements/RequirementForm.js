"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function RequirementForm({ initial, requirementId }) {
  const router = useRouter();
  const { t, statusLabel, priorityLabel } = useLanguage();
  const [form, setForm] = useState(
    initial || {
      title: "",
      description: "",
      category: "",
      priority: "MEDIUM",
      status: "DRAFT",
    }
  );
  const [error, setError] = useState("");
  const isEdit = Boolean(requirementId);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const url = isEdit ? `/api/requirements/${requirementId}` : "/api/requirements";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "저장에 실패했습니다.");
      return;
    }
    const saved = await res.json();
    router.push(`/requirements/${saved.id}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      {isEdit && initial?.code && (
        <div className="form-row">
          <label>{t("common.code")}</label>
          <input value={initial.code} disabled />
        </div>
      )}
      <div className="form-row">
        <label>{t("common.title")}</label>
        <input value={form.title} onChange={(e) => update("title", e.target.value)} required />
      </div>
      <div className="form-row">
        <label>{t("common.description")}</label>
        <textarea value={form.description || ""} onChange={(e) => update("description", e.target.value)} />
      </div>
      <div className="form-row">
        <label>{t("common.category")} ({t("common.code")}: UI &rarr; UI-01)</label>
        <input value={form.category || ""} onChange={(e) => update("category", e.target.value)} />
      </div>
      <div className="form-row">
        <label>{t("common.priority")}</label>
        <select value={form.priority} onChange={(e) => update("priority", e.target.value)}>
          {["LOW", "MEDIUM", "HIGH"].map((k) => (
            <option key={k} value={k}>{priorityLabel(k)}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>{t("common.status")}</label>
        <select value={form.status} onChange={(e) => update("status", e.target.value)}>
          {["DRAFT", "APPROVED", "IN_PROGRESS", "DONE"].map((k) => (
            <option key={k} value={k}>{statusLabel(k)}</option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit">{t("common.save")}</button>
    </form>
  );
}
