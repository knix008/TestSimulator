// Available UI themes. `bars` are the swatch colours shown in the picker
// (background / panel / accent); the real palettes live in App.css as
// :root[data-theme='<id>'] blocks.
//
// A reader is looked at for hours, so the set deliberately spans warm paper
// tones, dark themes for night reading and two high-contrast options.
export const THEMES = [
  { id: 'dark', bars: ['#14161c', '#1d2027', '#5bb8e8'] },
  { id: 'light', bars: ['#f4f4f6', '#ffffff', '#1f7ac0'] },
  { id: 'paper', bars: ['#f3ece0', '#fbf7ef', '#a2671f'] },
  { id: 'sepia', bars: ['#efe2cd', '#f8eedb', '#8a5a26'] },
  { id: 'night', bars: ['#0c0d11', '#15171d', '#7aa2f7'] },
  { id: 'midnight', bars: ['#0d1117', '#161b22', '#4493f8'] },
  { id: 'nord', bars: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'forest', bars: ['#101a12', '#17251a', '#7fce6a'] },
  { id: 'ocean', bars: ['#0b1e2a', '#122b3a', '#3fc1c9'] },
  { id: 'mocha', bars: ['#1c1512', '#261c17', '#d9a066'] },
  { id: 'rose', bars: ['#1b1220', '#251829', '#e0559b'] },
  { id: 'grape', bars: ['#16101c', '#201628', '#a86ad4'] },
  { id: 'ember', bars: ['#1a100c', '#261812', '#e07040'] },
  { id: 'crimson', bars: ['#180c10', '#241418', '#e04560'] },
  { id: 'slate', bars: ['#1c1e22', '#26282d', '#7d8fa3'] },
  { id: 'solarized', bars: ['#fdf6e3', '#eee8d5', '#268bd2'] },
  { id: 'sky', bars: ['#eef4fb', '#ffffff', '#2f7fe0'] },
  { id: 'matcha', bars: ['#f2f4e8', '#ffffff', '#5a8f3c'] },
  { id: 'lavender', bars: ['#f4eef8', '#ffffff', '#7c5cbf'] },
  { id: 'sand', bars: ['#f6efe4', '#fffaf3', '#c47a3a'] },
  { id: 'ice', bars: ['#eef6f6', '#ffffff', '#2a9aaa'] },
  { id: 'contrast', bars: ['#000000', '#141414', '#ffd400'] },
  { id: 'contrast-light', bars: ['#ffffff', '#ffffff', '#0033cc'] },

  /* dark */
  { id: 'carbon', bars: ['#17181a', '#202226', '#7f8cff'] },
  { id: 'obsidian', bars: ['#100e18', '#191527', '#b98cff'] },
  { id: 'abyss', bars: ['#07161c', '#0d2129', '#34d0c0'] },
  { id: 'espresso', bars: ['#17110e', '#201814', '#d99a5b'] },
  { id: 'moss', bars: ['#14180f', '#1c2216', '#a8c15c'] },
  { id: 'plum', bars: ['#1a0f16', '#24151f', '#e072b0'] },
  { id: 'dusk', bars: ['#161a22', '#1f242e', '#f0a868'] },

  /* light */
  { id: 'cloud', bars: ['#f2f5f9', '#ffffff', '#3b6fd4'] },
  { id: 'linen', bars: ['#f7f2e8', '#fffbf3', '#9a7b3f'] },
  { id: 'mint', bars: ['#edf7f2', '#ffffff', '#17a06a'] },
  { id: 'peach', bars: ['#fdf1ea', '#fffaf6', '#dd6b3f'] },
  { id: 'sakura', bars: ['#fdf0f4', '#fffafc', '#d9558b'] },
  { id: 'sage', bars: ['#f1f4ec', '#fcfdfa', '#61873c'] },
  { id: 'pearl', bars: ['#f5f3f7', '#ffffff', '#6b5bd6'] },
  { id: 'honey', bars: ['#fdf5e2', '#fffcf2', '#c08a12'] },
  { id: 'porcelain', bars: ['#eef1f4', '#fbfcfd', '#2e8fa8'] },
  { id: 'meadow', bars: ['#f0f7ea', '#fdfff9', '#4d9a34'] },
];

export const THEME_IDS = THEMES.map((t) => t.id);

/** Walks the shipped list in order and wraps. An unknown id starts at the first. */
export function nextTheme(id) {
  if (!THEME_IDS.length) return id || 'dark';
  const i = THEME_IDS.indexOf(id);
  return THEME_IDS[(i + 1 + THEME_IDS.length) % THEME_IDS.length];
}

export const DARK_THEME_IDS = new Set([
  'dark', 'night', 'midnight', 'nord', 'forest', 'ocean', 'mocha', 'rose',
  'grape', 'ember', 'crimson', 'slate', 'contrast',
  'carbon', 'obsidian', 'abyss', 'espresso', 'moss', 'plum', 'dusk',
]);

export function isDarkTheme(id) {
  return DARK_THEME_IDS.has(id);
}

/**
 * The same themes, split into the two families a reader actually chooses
 * between. Order inside each group is the shipped order, so the picker and
 * the "next theme" button still walk the list the same way.
 */
export function themeGroups(themes = THEMES) {
  return [
    { kind: 'dark', themes: themes.filter((t) => isDarkTheme(t.id)) },
    { kind: 'light', themes: themes.filter((t) => !isDarkTheme(t.id)) },
  ];
}

/** The background the reading page itself gets — paper themes keep their tint. */
export const PAPER_THEME_IDS = new Set(['paper', 'sepia', 'sand', 'solarized', 'linen', 'honey']);

export function isPaperTheme(id) {
  return PAPER_THEME_IDS.has(id);
}
