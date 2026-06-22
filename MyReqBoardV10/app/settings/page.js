"use client";

import { useSession } from "next-auth/react";
import DbConnectForm from "../components/DbConnectForm";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();

  if (session && session.user.role !== "ADMIN") {
    return <p>{t("settings.adminOnly")}</p>;
  }

  return (
    <div>
      <h2>{t("settings.title")}</h2>
      <p>
        현재 이 서버 프로세스가 사용 중인 DB 접속 정보입니다. 다른 DB로 바꾸려면 아래에서 다시 접속하세요.
        접속 정보는 .env에 저장되지 않고 서버가 실행 중인 동안에만 메모리에 유지됩니다.
      </p>
      <DbConnectForm />
    </div>
  );
}
