"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function ImportPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setResult(null);
    setBusy(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/import", { method: "POST", body: formData });
    setBusy(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "가져오기에 실패했습니다.");
      return;
    }
    setResult(await res.json());
  }

  if (session && session.user.role === "VIEWER") {
    return <p>{t("import.viewerNotice")}</p>;
  }

  return (
    <div>
      <h2>{t("import.title")}</h2>
      <p>
        {t("import.help")}
        <br />
        priority: LOW / MEDIUM / HIGH, status: DRAFT / APPROVED / IN_PROGRESS / DONE
        <br />
        code가 이미 존재하면 해당 요구사항을 업데이트하고, 없으면 새로 생성합니다.
      </p>
      <p>
        <a className="btn" href="/sample/sample_requirements.xlsx" download>
          {t("import.sampleLink")}
        </a>
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files[0])} required />
        </div>
        <button type="submit" disabled={busy}>{busy ? t("common.processing") : t("import.upload")}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <p className="success">생성: {result.created}건, 업데이트: {result.updated}건</p>
          {result.errors.length > 0 && (
            <div>
              <p className="error">오류 {result.errors.length}건</p>
              <ul>
                {result.errors.map((msg, i) => (
                  <li key={i} className="error">{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
