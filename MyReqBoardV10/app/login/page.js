"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    if (res?.error) {
      setError(t("login.error"));
      return;
    }

    const statusRes = await fetch("/api/settings/db");
    const status = await statusRes.json();
    if (!status.connected || !status.schemaReady) {
      router.push("/settings");
    } else {
      router.push("/requirements");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 380, marginTop: 80 }}>
      <div style={{ textAlign: "right" }}>
        <button className="secondary" onClick={() => setLang(lang === "ko" ? "en" : "ko")}>
          {lang === "ko" ? "EN" : "한국어"}
        </button>
      </div>
      <h2>{t("login.title")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>{t("common.id")}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>{t("common.password")}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">{t("login.title")}</button>
      </form>
      <p style={{ marginTop: 12 }}><Link href="/register">{t("login.registerLink")}</Link></p>
      <p style={{ marginTop: 24, fontSize: "0.85em", color: "#6b7280" }}>
        처음 사용하시나요? <b>admin / admin</b>으로 로그인하면 DB 설정 화면으로 이동합니다.
      </p>
    </div>
  );
}
