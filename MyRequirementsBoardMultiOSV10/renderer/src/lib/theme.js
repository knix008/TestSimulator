export const THEME_STORAGE_KEY = 'mrb_theme';
export const DEFAULT_THEME = 'light';

export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

export function getStoredTheme() {
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
