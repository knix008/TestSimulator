import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, saveLanguagePreference } from '../lib/appPreferences.js';
import { translate } from '../i18n/index.js';

const LanguageContext = createContext(null);

export function LanguageProvider({ children, initialLanguage = DEFAULT_LANGUAGE }) {
  const [language, setLanguageState] = useState(
    initialLanguage === 'en' ? 'en' : DEFAULT_LANGUAGE,
  );

  useEffect(() => {
    setLanguageState(initialLanguage === 'en' ? 'en' : DEFAULT_LANGUAGE);
  }, [initialLanguage]);

  const setLanguage = useCallback((lang, options = {}) => {
    const next = lang === 'en' ? 'en' : DEFAULT_LANGUAGE;
    setLanguageState(next);
    if (options.persist !== false) {
      void saveLanguagePreference(next);
    }
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
