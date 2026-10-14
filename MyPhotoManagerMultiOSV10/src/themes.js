// Light and dark themes are CSS variable sets (styles.css, [data-theme]).
export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'light' ? 'light' : 'dark';
  root.style.colorScheme = root.dataset.theme;
}
