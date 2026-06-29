export const VALID_THEMES = ['default', 'dark', 'emerald', 'sunset', 'purple'];

export function normalizeTheme(theme) {
  return VALID_THEMES.includes(theme) ? theme : 'default';
}
