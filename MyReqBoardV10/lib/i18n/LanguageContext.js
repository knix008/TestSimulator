"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { dictionary, STATUS_LABEL, PRIORITY_LABEL, TC_STATUS_LABEL } from "./dictionary";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("ko");

  useEffect(() => {
    const saved = window.localStorage.getItem("lang");
    if (saved === "en" || saved === "ko") setLangState(saved);
  }, []);

  function setLang(next) {
    setLangState(next);
    window.localStorage.setItem("lang", next);
  }

  function t(key) {
    return dictionary[lang]?.[key] ?? dictionary.ko[key] ?? key;
  }

  function statusLabel(value) {
    return STATUS_LABEL[lang]?.[value] ?? value;
  }
  function priorityLabel(value) {
    return PRIORITY_LABEL[lang]?.[value] ?? value;
  }
  function tcStatusLabel(value) {
    return TC_STATUS_LABEL[lang]?.[value] ?? value;
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, statusLabel, priorityLabel, tcStatusLabel }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
