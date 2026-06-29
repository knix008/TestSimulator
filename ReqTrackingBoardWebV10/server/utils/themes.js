export const VALID_THEMES = [
  'default',
  'dark',
  'graphite',
  'emerald',
  'teal',
  'ocean',
  'indigo',
  'purple',
  'rose',
  'crimson',
  'sunset',
  'amber',
  'slate',
  'coffee',
];

export function normalizeTheme(theme) {
  return VALID_THEMES.includes(theme) ? theme : 'default';
}
