import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import i18n from '../i18n';
import api from '../api';
import { useAuth } from './AuthContext';

const VALID_LANGUAGES = ['ko', 'en'];

function normalizeLanguage(language) {
  return VALID_LANGUAGES.includes(language) ? language : 'ko';
}

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user, updateUserLocal } = useAuth();
  const [language, setLanguageState] = useState('ko');

  useEffect(() => {
    const lng = user ? normalizeLanguage(user.language) : 'ko';
    setLanguageState(lng);
    if (i18n.language !== lng) {
      i18n.changeLanguage(lng);
    }
  }, [user?.id, user?.language]);

  const setLanguage = useCallback(async (lng) => {
    const next = normalizeLanguage(lng);
    setLanguageState(next);
    await i18n.changeLanguage(next);

    if (user) {
      try {
        await api.put('/settings/language', { language: next });
        updateUserLocal({ language: next });
      } catch {
        /* UI already updated */
      }
    }
  }, [user, updateUserLocal]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
