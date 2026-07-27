const STORAGE_KEY = 'fp3d-theme';

export function getPreferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  return next;
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'light' ? 'dark' : 'light');
}

export function initTheme() {
  return applyTheme(getPreferredTheme());
}
