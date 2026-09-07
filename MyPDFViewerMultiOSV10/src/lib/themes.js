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
];

export const THEME_IDS = THEMES.map((t) => t.id);

// The colour the page area is tinted with per theme (the paper itself always
// stays white so PDFs render truthfully).
export function isDarkTheme(id) {
  return ['dark', 'midnight', 'nord', 'forest', 'rose', 'contrast', 'ocean', 'mocha'].includes(id);
}
