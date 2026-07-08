import path from 'node:path';
import fs from 'node:fs/promises';
import { app } from 'electron';

const DEFAULT_PREFERENCES = {
  language: 'ko',
  theme: 'light',
  accentColor: '#3b82f6',
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function normalizeAccentColor(value) {
  const candidate = String(value || '').trim();
  if (!HEX_COLOR_PATTERN.test(candidate)) return DEFAULT_PREFERENCES.accentColor;
  return candidate.toLowerCase();
}

function getPreferencesPath() {
  return path.join(app.getPath('userData'), 'app-preferences.json');
}

function normalizePreferences(data) {
  const language = data?.language === 'en' ? 'en' : 'ko';
  const theme = data?.theme === 'dark' ? 'dark' : 'light';
  const accentColor = normalizeAccentColor(data?.accentColor);
  return { language, theme, accentColor };
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
