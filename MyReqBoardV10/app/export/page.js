"use client";

import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function ExportPage() {
  const { t } = useLanguage();
  return (
    <div>
      <h2>{t("export.title")}</h2>
      <p>{t("export.desc")} (Sheet1: Requirements, Sheet2: TestCases)</p>
      <p>전체가 아닌 일부만 내보내려면 요구사항 목록에서 체크박스로 선택한 뒤 &quot;선택 내보내기&quot;를 사용하세요.</p>
      <a className="btn" href="/api/export">{t("export.all")}</a>
    </div>
  );
}
