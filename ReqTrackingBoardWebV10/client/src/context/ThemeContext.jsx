import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { applyTheme, normalizeTheme } from '../themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user, updateUserLocal } = useAuth();
  const [theme, setThemeState] = useState('default');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (user) {
      const userTheme = normalizeTheme(user.theme);
      setThemeState(userTheme);
      applyTheme(userTheme);
    } else {
      setThemeState('default');
      applyTheme('default');
    }
    setReady(true);
  }, [user?.id, user?.theme]);

  const setTheme = useCallback(async (themeName) => {
    const next = normalizeTheme(themeName);
    setThemeState(next);
    applyTheme(next);

    if (user) {
      try {
        await api.put('/settings/theme', { theme: next });
        updateUserLocal({ theme: next });
      } catch {
        // UI already updated; user can retry from settings
      }
    }
  }, [user, updateUserLocal]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
