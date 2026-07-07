import { DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme } from './theme.js';
import { patchUserPreferencesIfAuthed } from './userPreferences.js';

export const LANGUAGE_STORAGE_KEY = 'mrb_language';
export const DEFAULT_LANGUAGE = 'ko';

function readLocalPreferences() {
  const language = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const theme = localStorage.getItem(THEME_STORAGE_KEY);

  return {
    language: language === 'en' ? 'en' : DEFAULT_LANGUAGE,
    theme: normalizeTheme(theme || DEFAULT_THEME),
  };
}

function writeLocalPreferences(partial) {
  if (partial.language !== undefined) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, partial.language === 'en' ? 'en' : DEFAULT_LANGUAGE);
  }
  if (partial.theme !== undefined) {
    localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(partial.theme));
  }
}

export async function loadAppPreferences() {
  const local = readLocalPreferences();

  if (window.electronAPI?.ensurePreferences) {
    try {
      const prefs = await window.electronAPI.ensurePreferences(local);
      writeLocalPreferences(prefs);
      return {
        language: prefs.language === 'en' ? 'en' : DEFAULT_LANGUAGE,
        theme: normalizeTheme(prefs.theme),
      };
    } catch {
      return local;
    }
  }

  if (window.electronAPI?.getPreferences) {
    try {
      const prefs = await window.electronAPI.getPreferences();
      writeLocalPreferences(prefs);
      return {
        language: prefs.language === 'en' ? 'en' : DEFAULT_LANGUAGE,
        theme: normalizeTheme(prefs.theme),
      };
    } catch {
      return local;
    }
  }

  return local;
}

export async function saveAppPreferences(partial) {
  writeLocalPreferences(partial);
  await patchUserPreferencesIfAuthed(partial);

  if (window.electronAPI?.savePreferences) {
    try {
      const saved = await window.electronAPI.savePreferences(partial);
      writeLocalPreferences(saved);
      return {
        language: saved.language === 'en' ? 'en' : DEFAULT_LANGUAGE,
        theme: normalizeTheme(saved.theme),
      };
    } catch {
      return readLocalPreferences();
    }
  }

  return readLocalPreferences();
}

export async function saveLanguagePreference(language) {
  const next = language === 'en' ? 'en' : DEFAULT_LANGUAGE;
  return saveAppPreferences({ language: next });
}

export async function saveThemePreference(theme) {
  return saveAppPreferences({ theme: normalizeTheme(theme) });
}
