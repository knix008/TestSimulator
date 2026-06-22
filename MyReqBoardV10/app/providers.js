"use client";

import { SessionProvider } from "next-auth/react";
import { LanguageProvider } from "../lib/i18n/LanguageContext";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <LanguageProvider>{children}</LanguageProvider>
    </SessionProvider>
  );
}
