import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, translate } from '../i18n/index.js';

const STORAGE_KEY = 'mrb_language';
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' ? 'en' : DEFAULT_LANGUAGE;
  });

  const setLanguage = useCallback((lang) => {
    const next = lang === 'en' ? 'en' : DEFAULT_LANGUAGE;
    setLanguageState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
