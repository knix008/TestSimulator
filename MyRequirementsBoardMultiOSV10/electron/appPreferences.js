import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

const DEFAULT_PREFERENCES = {
  language: 'ko',
  theme: 'light',
};

function getPreferencesPath() {
  return path.join(app.getPath('userData'), 'app-preferences.json');
}

function normalizePreferences(data) {
  const language = data?.language === 'en' ? 'en' : 'ko';
  const theme = data?.theme === 'dark' ? 'dark' : 'light';
  return { language, theme };
}

export async function loadAppPreferences() {
  try {
    const raw = await fs.readFile(getPreferencesPath(), 'utf8');
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function saveAppPreferences(partial) {
  const current = await loadAppPreferences();
  const next = normalizePreferences({ ...current, ...partial });
  await fs.writeFile(getPreferencesPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Create preferences file from local fallback when missing (first run / migration). */
export async function ensureAppPreferences(localFallback) {
  try {
    await fs.access(getPreferencesPath());
    return loadAppPreferences();
  } catch {
    return saveAppPreferences(normalizePreferences(localFallback || DEFAULT_PREFERENCES));
  }
}
