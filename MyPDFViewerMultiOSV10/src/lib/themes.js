// Available UI themes. `bars` are the swatch colours shown in the picker
// (background / panel / accent); the real palettes live in App.css as
// :root[data-theme='<id>'] blocks.
export const THEMES = [
  { id: 'dark', bars: ['#14100f', '#1e1918', '#e0574d'] },
  { id: 'light', bars: ['#f4f2f0', '#ffffff', '#c33a32'] },
  { id: 'white', bars: ['#ffffff', '#ffffff', '#c33a32'] },
  { id: 'midnight', bars: ['#0d1117', '#161b22', '#4493f8'] },
  { id: 'nord', bars: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'forest', bars: ['#12180f', '#1b2416', '#8fce5a'] },
  { id: 'rose', bars: ['#1b1220', '#251829', '#e0559b'] },
  { id: 'solarized', bars: ['#fdf6e3', '#eee8d5', '#268bd2'] },
  { id: 'contrast', bars: ['#000000', '#1a1a1a', '#ffd400'] },
  { id: 'ocean', bars: ['#0b1e2a', '#122b3a', '#3fc1c9'] },
  { id: 'mocha', bars: ['#1c1512', '#261c17', '#d9a066'] },
  { id: 'sky', bars: ['#eef4fb', '#ffffff', '#2f7fe0'] },
  { id: 'lavender', bars: ['#f4eef8', '#ffffff', '#7c5cbf'] },
  { id: 'ember', bars: ['#1a100c', '#261812', '#e07040'] },
  { id: 'slate', bars: ['#1c1e22', '#26282d', '#7d8fa3'] },
  { id: 'matcha', bars: ['#f2f4e8', '#ffffff', '#5a8f3c'] },
  { id: 'grape', bars: ['#16101c', '#201628', '#a86ad4'] },
  { id: 'sand', bars: ['#f6efe4', '#fffaf3', '#c47a3a'] },
  { id: 'ice', bars: ['#eef6f6', '#ffffff', '#2a9aaa'] },
  { id: 'crimson', bars: ['#180c10', '#241418', '#e04560'] },
];

export const THEME_IDS = THEMES.map((t) => t.id);

// Walks the shipped list in order and wraps. An unknown id starts at the first.
export function nextTheme(id) {
  if (!THEME_IDS.length) return id || 'dark';
  const i = THEME_IDS.indexOf(id);
  return THEME_IDS[(i + 1 + THEME_IDS.length) % THEME_IDS.length];
}

export const DARK_THEME_IDS = new Set([
  'dark', 'midnight', 'nord', 'forest', 'rose', 'contrast', 'ocean', 'mocha',
  'ember', 'slate', 'grape', 'crimson',
]);

// The colour the page area is tinted with per theme (the paper itself always
// stays white so PDFs render truthfully).
export function isDarkTheme(id) {
  return DARK_THEME_IDS.has(id);
}
