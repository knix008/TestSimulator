"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function AccountPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({
    username: "",
    name: "",
    email: "",
    company: "",
    department: "",
    password: "",
    currentPassword: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => {
        setMe(data);
        setForm((prev) => ({
          ...prev,
          username: data.username,
          name: data.name,
          email: data.email || "",
          company: data.company || "",
          department: data.department || "",
        }));
      });
  }, [session]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/account", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "변경에 실패했습니다.");
      return;
    }
    setDone(true);
  }

  if (!session || !me) return null;

  if (done) {
    return (
      <div>
        <p className="success">{t("account.savedNotice")}</p>
        <button onClick={() => signOut({ callbackUrl: "/login" })}>{t("account.reloginBtn")}</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h2>{t("account.title")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>{t("common.id")}</label>
          <input value={form.username} onChange={(e) => update("username", e.target.value)} required />
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
          <label>{t("account.newPassword")}</label>
          <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} />
        </div>
        <div className="form-row">
          <label>{t("account.currentPassword")}</label>
          <input
            type="password"
            value={form.currentPassword}
            onChange={(e) => update("currentPassword", e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">{t("common.save")}</button>
      </form>
    </div>
  );
}
