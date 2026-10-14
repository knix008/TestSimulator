// Themes: 20 dark and 20 light, plus one the user defines. Each theme is a
// few seed colours (background, text, accent; optionally a panel colour) from
// which every CSS variable of styles.css is derived, so all themes keep the
// same structure and contrast. applyTheme() writes the variables on <html>.

const DARK = [
  ['dark', 'Default Dark', '#16181d', '#e6e8ec', '#4c8dff'],
  ['midnight', 'Midnight', '#0d1117', '#e6edf3', '#2f81f7'],
  ['nord', 'Nord', '#2e3440', '#eceff4', '#88c0d0'],
  ['dracula', 'Dracula', '#282a36', '#f8f8f2', '#bd93f9'],
  ['monokai', 'Monokai', '#272822', '#f8f8f2', '#a6e22e'],
  ['solarized-dark', 'Solarized Dark', '#002b36', '#eee8d5', '#2aa1e6'],
  ['gruvbox-dark', 'Gruvbox Dark', '#282828', '#ebdbb2', '#fabd2f'],
  ['one-dark', 'One Dark', '#282c34', '#dcdfe4', '#61afef'],
  ['tokyo-night', 'Tokyo Night', '#1a1b26', '#c0caf5', '#7aa2f7'],
  ['catppuccin-mocha', 'Catppuccin Mocha', '#1e1e2e', '#cdd6f4', '#cba6f7'],
  ['oceanic', 'Oceanic', '#1b2b34', '#d8dee9', '#6fa3d9'],
  ['forest', 'Forest', '#172019', '#dfe9dc', '#5fbf77'],
  ['amethyst', 'Amethyst', '#1d1726', '#e8e0f2', '#a67cf0'],
  ['ember', 'Ember', '#1f1512', '#f1e3dc', '#ff7a45'],
  ['crimson', 'Crimson', '#1c1214', '#f2dfe2', '#ff5c7a'],
  ['graphite', 'Graphite', '#1a1a1a', '#e0e0e0', '#8ab4f8'],
  ['teal-dark', 'Teal', '#0f1d1f', '#dcefee', '#2ec4b6'],
  ['cyberpunk', 'Cyberpunk', '#0c0a1a', '#f0e9ff', '#ff2bd6'],
  ['espresso', 'Espresso', '#211a16', '#eee2d6', '#d59a5b'],
  ['high-contrast', 'High Contrast', '#000000', '#ffffff', '#ffd400'],
];

const LIGHT = [
  ['light', 'Default Light', '#f3f4f7', '#1c2029', '#2f6fe4'],
  ['paper', 'Paper', '#faf8f3', '#2b2924', '#b0572b'],
  ['solarized-light', 'Solarized Light', '#fdf6e3', '#073642', '#1f7fbf'],
  ['github-light', 'GitHub Light', '#f6f8fa', '#1f2328', '#0969da'],
  ['nord-light', 'Nord Light', '#eceff4', '#2e3440', '#4c6f9f'],
  ['gruvbox-light', 'Gruvbox Light', '#fbf1c7', '#3c3836', '#af3a03'],
  ['catppuccin-latte', 'Catppuccin Latte', '#eff1f5', '#363a4f', '#8839ef'],
  ['one-light', 'One Light', '#fafafa', '#383a42', '#4078f2'],
  ['mint', 'Mint', '#eff8f3', '#1d2e25', '#17895a'],
  ['sky', 'Sky', '#eef6fc', '#182b3a', '#0a78b8'],
  ['lavender', 'Lavender', '#f5f2fb', '#2b2438', '#7347e8'],
  ['peach', 'Peach', '#fdf3ee', '#3a2720', '#d2552b'],
  ['rose', 'Rose', '#fcf1f3', '#3a2028', '#d6336c'],
  ['sand', 'Sand', '#f6f0e4', '#3a3226', '#946a1f'],
  ['sage', 'Sage', '#f1f4ee', '#27301f', '#4f7a31'],
  ['slate', 'Slate', '#eef1f5', '#1e2633', '#475d85'],
  ['lemon', 'Lemon', '#fbfaea', '#2f2d1a', '#8f7300'],
  ['ocean-light', 'Ocean', '#eaf4f4', '#15302f', '#0b7d79'],
  ['cloud', 'Cloud', '#f7f7f8', '#26262b', '#5b5ef0'],
  ['high-contrast-light', 'High Contrast Light', '#ffffff', '#000000', '#0040c0'],
];

const seed = (mode) => ([id, name, bg, text, accent]) => ({ id, name, mode, bg, text, accent });
export const THEMES = Object.freeze([...DARK.map(seed('dark')), ...LIGHT.map(seed('light'))]);
export const DEFAULT_CUSTOM = Object.freeze({ mode: 'dark', bg: '#1b1e26', panel: '', text: '#e8e6e3', accent: '#e0a030' });

// ───────── colour arithmetic

const hex = (value) => {
  const s = String(value ?? '').trim().replace('#', '');
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  return /^[0-9a-f]{6}$/i.test(full) ? [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) : null;
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** a → b by amount k (0…1). */
export const mix = (a, b, k) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * k));
const rgba = (color, alpha) => `rgba(${hex(color).join(', ')}, ${alpha})`;

function luminance(color) {
  const [r, g, b] = hex(color).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours (1…21). */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const isColor = (value) => Boolean(hex(value));

/** Every CSS variable of a theme (seed: { mode, bg, text, accent, panel? }). */
export function themeVars({ mode, bg, text, accent, panel }) {
  const dark = mode !== 'light';
  const accentText = contrast(accent, '#ffffff') >= contrast(accent, '#111111') ? '#ffffff' : '#111111';
  const common = {
    '--text': text,
    '--text-2': mix(text, bg, 0.24),
    '--text-3': mix(text, bg, 0.42),
    '--accent': accent,
    '--accent-2': mix(accent, dark ? '#000000' : '#000000', 0.15),
    '--accent-soft': rgba(accent, dark ? 0.18 : 0.12),
    '--accent-text': accentText,
    '--select': rgba(accent, dark ? 0.28 : 0.18),
    '--select-line': accent,
  };
  if (dark) {
    return {
      '--bg': bg,
      '--bg-2': mix(bg, '#ffffff', 0.035),
      '--bg-3': mix(bg, '#ffffff', 0.075),
      '--bg-4': mix(bg, '#ffffff', 0.12),
      '--panel': panel && isColor(panel) ? panel : mix(bg, '#ffffff', 0.02),
      '--line': mix(bg, text, 0.13),
      '--line-2': mix(bg, text, 0.2),
      ...common,
      '--danger': '#ff5d5d', '--warn': '#f2b33d', '--ok': '#3ccf8e', '--star': '#ffc531',
      '--shadow': '0 8px 28px rgba(0, 0, 0, 0.45)',
      '--thumb-bg': mix(bg, '#000000', 0.3),
      '--viewer-bg': mix(bg, '#000000', 0.5),
      '--input': mix(bg, '#000000', 0.18),
    };
  }
  return {
    '--bg': bg,
    '--bg-2': mix(bg, '#ffffff', 0.7),
    '--bg-3': mix(bg, text, 0.04),
    '--bg-4': mix(bg, text, 0.09),
    '--panel': panel && isColor(panel) ? panel : mix(bg, '#ffffff', 0.5),
    '--line': mix(bg, text, 0.12),
    '--line-2': mix(bg, text, 0.2),
    ...common,
    '--danger': '#d93636', '--warn': '#b7791f', '--ok': '#1e9e63', '--star': '#e8a600',
    '--shadow': '0 8px 28px rgba(20, 30, 60, 0.18)',
    '--thumb-bg': mix(bg, text, 0.07),
    '--viewer-bg': mix(text, '#000000', 0.25),
    '--input': mix(bg, '#ffffff', 0.85),
  };
}

/** The custom theme from settings, with every colour checked. */
export function customTheme(custom) {
  const c = { ...DEFAULT_CUSTOM, ...(custom ?? {}) };
  return {
    id: 'custom', name: 'Custom', mode: c.mode === 'light' ? 'light' : 'dark',
    bg: isColor(c.bg) ? c.bg : DEFAULT_CUSTOM.bg, text: isColor(c.text) ? c.text : DEFAULT_CUSTOM.text,
    accent: isColor(c.accent) ? c.accent : DEFAULT_CUSTOM.accent, panel: isColor(c.panel) ? c.panel : '',
  };
}

/** Theme for an id ('custom' uses `custom`); unknown ids fall back to the default dark theme. */
export function themeOf(id, custom) {
  if (id === 'custom') return customTheme(custom);
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** The theme after `id` in the list (the theme button walks through all of them). */
export function nextTheme(id) {
  const index = THEMES.findIndex((theme) => theme.id === id);
  return THEMES[(index + 1) % THEMES.length];
}

/** Applies a theme (id or theme object). Returns the theme. */
export function applyTheme(theme, custom) {
  const t = typeof theme === 'string' ? themeOf(theme, custom) : theme;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(t))) root.style.setProperty(name, value);
  root.dataset.theme = t.mode;
  root.dataset.themeId = t.id;
  root.style.colorScheme = t.mode;
  return t;
}
