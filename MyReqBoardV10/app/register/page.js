"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function RegisterPage() {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    company: "",
    department: "",
    requestedRole: "VIEWER",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "요청에 실패했습니다.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="container" style={{ maxWidth: 420, marginTop: 60 }}>
        <p className="success">{t("register.done")}</p>
        <Link href="/login">{t("register.backToLogin")}</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 420, marginTop: 40 }}>
      <h2>{t("register.title")}</h2>
      <p>{t("register.desc")}</p>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>{t("common.id")}</label>
          <input value={form.username} onChange={(e) => update("username", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.password")}</label>
          <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.name")}</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.email")}</label>
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t("common.company")}</label>
          <input value={form.company} onChange={(e) => update("company", e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t("common.department")}</label>
          <input value={form.department} onChange={(e) => update("department", e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t("register.requestedRole")}</label>
          <select value={form.requestedRole} onChange={(e) => update("requestedRole", e.target.value)}>
            <option value="VIEWER">VIEWER</option>
            <option value="EDITOR">EDITOR</option>
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">{t("register.submit")}</button>
      </form>
      <p style={{ marginTop: 12 }}><Link href="/login">{t("register.backToLogin")}</Link></p>
    </div>
  );
}
