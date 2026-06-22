"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n/LanguageContext";

export default function Nav() {
  const { data: session } = useSession();
  const { t, lang, setLang } = useLanguage();

  if (!session) return null;

  const role = session.user.role;
  const isBootstrap = session.user.id === "bootstrap";

  return (
    <nav className="nav">
      {!isBootstrap && <Link href="/requirements">{t("nav.requirements")}</Link>}
      {!isBootstrap && (role === "EDITOR" || role === "ADMIN") && <Link href="/import">{t("nav.import")}</Link>}
      {!isBootstrap && <Link href="/export">{t("nav.export")}</Link>}
      {!isBootstrap && role === "ADMIN" && <Link href="/users">{t("nav.users")}</Link>}
      {role === "ADMIN" && <Link href="/settings">{t("nav.settings")}</Link>}
      <div className="spacer" />
      <button className="secondary" onClick={() => setLang(lang === "ko" ? "en" : "ko")}>
        {lang === "ko" ? "EN" : "한국어"}
      </button>
      {!isBootstrap && <Link href="/account">{t("nav.account")}</Link>}
      <span className="user">
        {session.user.name} ({role})
      </span>
      <button className="secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
        {t("nav.logout")}
      </button>
    </nav>
  );
}
