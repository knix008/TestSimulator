import { useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function UserPreferencesSync() {
  const { user } = useAuth();
  const { setLanguage } = useLanguage();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!user) return;

    api.getUserPreferences()
      .then((prefs) => {
        if (prefs.language) setLanguage(prefs.language, { persist: false });
        if (prefs.theme) setTheme(prefs.theme, { persist: false });
      })
      .catch(() => {});
  }, [user?.id, setLanguage, setTheme]);

  return null;
}
