export const THEME_STORAGE_KEY = 'mrb_theme';
export const DEFAULT_THEME = 'light';
export const ACCENT_COLOR_STORAGE_KEY = 'mrb_accent_color';
export const DEFAULT_ACCENT_COLOR = '#3b82f6';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function normalizeAccentColor(value) {
  const candidate = String(value || '').trim();
  if (!HEX_COLOR_PATTERN.test(candidate)) return DEFAULT_ACCENT_COLOR;
  return candidate.toLowerCase();
}

export function getStoredTheme() {
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

export function getStoredAccentColor() {
  return normalizeAccentColor(localStorage.getItem(ACCENT_COLOR_STORAGE_KEY));
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}

export function applyAccentColor(color) {
  document.documentElement.style.setProperty('--theme-accent', normalizeAccentColor(color));
}

export function initTheme() {
  applyTheme(getStoredTheme());
  applyAccentColor(getStoredAccentColor());
}
