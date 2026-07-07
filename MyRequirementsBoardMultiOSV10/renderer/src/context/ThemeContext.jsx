import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { saveThemePreference } from '../lib/appPreferences.js';
import {
  DEFAULT_THEME,
  applyTheme,
  normalizeTheme,
} from '../lib/theme.js';

const ThemeContext = createContext(null);

export function ThemeProvider({ children, initialTheme = DEFAULT_THEME }) {
  const [theme, setThemeState] = useState(() => normalizeTheme(initialTheme));

  useEffect(() => {
    setThemeState(normalizeTheme(initialTheme));
  }, [initialTheme]);

  const setTheme = useCallback((nextTheme, options = {}) => {
    const normalized = normalizeTheme(nextTheme);
    setThemeState(normalized);
    applyTheme(normalized);
    if (options.persist !== false) {
      void saveThemePreference(normalized);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    isDark: theme === 'dark',
  }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export { DEFAULT_THEME };
