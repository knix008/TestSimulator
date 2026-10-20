// Available UI themes. `bars` are the swatch colours shown in the picker
// (background / panel / accent); the real palettes live in App.css as
// :root[data-theme='<id>'] blocks. Twenty dark and twenty light, classified
// by `kind`.

export const THEMES = [
  // Dark
  { id: 'dark', kind: 'dark', bars: ['#14100f', '#1e1918', '#e0574d'] },
  { id: 'midnight', kind: 'dark', bars: ['#0d1117', '#161b22', '#4493f8'] },
  { id: 'nord', kind: 'dark', bars: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'forest', kind: 'dark', bars: ['#12180f', '#1b2416', '#8fce5a'] },
  { id: 'rose', kind: 'dark', bars: ['#1b1220', '#251829', '#e0559b'] },
  { id: 'contrast', kind: 'dark', bars: ['#000000', '#1a1a1a', '#ffd400'] },
  { id: 'ocean', kind: 'dark', bars: ['#0b1e2a', '#122b3a', '#3fc1c9'] },
  { id: 'mocha', kind: 'dark', bars: ['#1c1512', '#261c17', '#d9a066'] },
  { id: 'ember', kind: 'dark', bars: ['#1a100c', '#261812', '#e07040'] },
  { id: 'slate', kind: 'dark', bars: ['#1c1e22', '#26282d', '#7d8fa3'] },
  { id: 'grape', kind: 'dark', bars: ['#16101c', '#201628', '#a86ad4'] },
  { id: 'crimson', kind: 'dark', bars: ['#180c10', '#241418', '#e04560'] },
  { id: 'charcoal', kind: 'dark', bars: ['#1a1a1c', '#242428', '#8a8a92'] },
  { id: 'onyx', kind: 'dark', bars: ['#0a0c10', '#141820', '#6aa0e0'] },
  { id: 'dusk', kind: 'dark', bars: ['#1a1624', '#241e32', '#c080e0'] },
  { id: 'pine', kind: 'dark', bars: ['#0e1812', '#16241c', '#4cae78'] },
  { id: 'rust', kind: 'dark', bars: ['#1c100c', '#281812', '#e07840'] },
  { id: 'ink', kind: 'dark', bars: ['#0c1420', '#142030', '#3d8ae0'] },
  { id: 'wine', kind: 'dark', bars: ['#1c0c12', '#281418', '#c04060'] },
  { id: 'storm', kind: 'dark', bars: ['#121820', '#1a2430', '#6a90b8'] },
  // Light
  { id: 'light', kind: 'light', bars: ['#f4f2f0', '#ffffff', '#c33a32'] },
  { id: 'white', kind: 'light', bars: ['#ffffff', '#ffffff', '#c33a32'] },
  { id: 'solarized', kind: 'light', bars: ['#fdf6e3', '#eee8d5', '#268bd2'] },
  { id: 'sky', kind: 'light', bars: ['#eef4fb', '#ffffff', '#2f7fe0'] },
  { id: 'lavender', kind: 'light', bars: ['#f4eef8', '#ffffff', '#7c5cbf'] },
  { id: 'matcha', kind: 'light', bars: ['#f2f4e8', '#ffffff', '#5a8f3c'] },
  { id: 'sand', kind: 'light', bars: ['#f6efe4', '#fffaf3', '#c47a3a'] },
  { id: 'ice', kind: 'light', bars: ['#eef6f6', '#ffffff', '#2a9aaa'] },
  { id: 'paper', kind: 'light', bars: ['#f7f4ee', '#fffdf8', '#5a4a38'] },
  { id: 'linen', kind: 'light', bars: ['#f3efe6', '#faf7f0', '#6b7a4e'] },
  { id: 'mist', kind: 'light', bars: ['#eef2f5', '#ffffff', '#5a7088'] },
  { id: 'peach', kind: 'light', bars: ['#fdf0e8', '#fff8f3', '#d06040'] },
  { id: 'mint', kind: 'light', bars: ['#eef6f0', '#f7fcf8', '#2f8f6a'] },
  { id: 'lemon', kind: 'light', bars: ['#faf6dc', '#fffce8', '#c09010'] },
  { id: 'cloud', kind: 'light', bars: ['#f0f3f8', '#ffffff', '#4a6aa0'] },
  { id: 'pearl', kind: 'light', bars: ['#f6f3f6', '#ffffff', '#8870a0'] },
  { id: 'blossom', kind: 'light', bars: ['#fbf0f3', '#fff8fa', '#d05078'] },
  { id: 'cream', kind: 'light', bars: ['#faf6ea', '#fffdf4', '#b07830'] },
  { id: 'frost', kind: 'light', bars: ['#eef6fa', '#f7fcfe', '#2a88b0'] },
  { id: 'dawn', kind: 'light', bars: ['#f8eee8', '#fff6f0', '#c05040'] },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const THEME_KINDS = ['dark', 'light'];
export const CUSTOM_PREFIX = 'custom-';
export const MAX_CUSTOM_THEMES = 12;
export const THEME_VAR_KEYS = [
  '--bg', '--bg-2', '--bg-3', '--panel', '--border',
  '--text', '--text-dim', '--muted',
  '--accent', '--accent-2', '--accent-fg',
  '--danger', '--warn', '--ok', '--page-bg', '--shadow',
];

export const DEFAULT_CUSTOM_COLORS = {
  dark: { bg: '#14100f', panel: '#1e1918', text: '#efe8e5', accent: '#e0574d' },
  light: { bg: '#f4f2f0', panel: '#ffffff', text: '#241f1d', accent: '#c33a32' },
};

export function themesByKind(kind) {
  return THEMES.filter((t) => t.kind === kind);
}

export const DARK_THEMES = themesByKind('dark');
export const LIGHT_THEMES = themesByKind('light');

export function isCustomThemeId(id) {
  return String(id || '').startsWith(CUSTOM_PREFIX);
}

export function newCustomThemeId() {
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}`;
}

export function parseHex(input) {
  const m = String(input || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : null;
}

function hexToRgb(hex) {
  const h = parseHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return parseHex(a) || '#000000';
  const k = Math.min(1, Math.max(0, Number(t) || 0));
  const ch = (x, y) => Math.round(x + (y - x) * k);
  return `#${[ch(A.r, B.r), ch(A.g, B.g), ch(A.b, B.b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastFg(hex) {
  return relativeLuminance(hex) > 0.45 ? '#141414' : '#ffffff';
}

// Four user colours expand into the full chrome palette.
export function expandThemeColors(kind, colors = {}) {
  const dark = kind !== 'light';
  const fallback = DEFAULT_CUSTOM_COLORS[dark ? 'dark' : 'light'];
  const bg = parseHex(colors.bg) || fallback.bg;
  const panel = parseHex(colors.panel) || fallback.panel;
  const text = parseHex(colors.text) || fallback.text;
  const accent = parseHex(colors.accent) || fallback.accent;
  return {
    '--bg': bg,
    '--bg-2': panel,
    '--bg-3': mixHex(panel, text, dark ? 0.12 : 0.08),
    '--panel': panel,
    '--border': mixHex(panel, text, dark ? 0.22 : 0.16),
    '--text': text,
    '--text-dim': mixHex(text, bg, 0.35),
    '--muted': mixHex(text, bg, 0.55),
    '--accent': accent,
    '--accent-2': mixHex(accent, '#000000', 0.22),
    '--accent-fg': contrastFg(accent),
    '--danger': dark ? '#e06666' : '#c0392b',
    '--warn': dark ? '#e0a750' : '#b57814',
    '--ok': dark ? '#58c08a' : '#2f8f5b',
    '--page-bg': mixHex(bg, dark ? '#000000' : '#ffffff', dark ? 0.35 : 0.12),
    '--shadow': dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.16)',
  };
}

export function customThemeBars(theme) {
  const colors = theme?.colors || {};
  return [
    parseHex(colors.bg) || '#888888',
    parseHex(colors.panel) || '#aaaaaa',
    parseHex(colors.accent) || '#666666',
  ];
}

export function normalizeCustomTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'light' ? 'light' : 'dark';
  const defaults = DEFAULT_CUSTOM_COLORS[kind];
  const src = raw.colors && typeof raw.colors === 'object' ? raw.colors : raw;
  const colors = {
    bg: parseHex(src.bg) || defaults.bg,
    panel: parseHex(src.panel) || defaults.panel,
    text: parseHex(src.text) || defaults.text,
    accent: parseHex(src.accent) || defaults.accent,
  };
  const id = isCustomThemeId(raw.id) ? String(raw.id) : newCustomThemeId();
  const name = String(raw.name || '').trim().slice(0, 24) || 'Custom';
  return { id, name, kind, colors };
}

export function normalizeCustomThemes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const theme = normalizeCustomTheme(raw);
    if (!theme || seen.has(theme.id)) continue;
    seen.add(theme.id);
    out.push(theme);
    if (out.length >= MAX_CUSTOM_THEMES) break;
  }
  return out;
}

export function pickerThemeFromCustom(theme) {
  return {
    id: theme.id,
    kind: theme.kind,
    name: theme.name,
    bars: customThemeBars(theme),
    custom: true,
  };
}

export function allThemes(customThemes = []) {
  return [...THEMES, ...normalizeCustomThemes(customThemes).map(pickerThemeFromCustom)];
}

export function themeIds(customThemes = []) {
  return allThemes(customThemes).map((t) => t.id);
}

// Walks built-in then custom themes and wraps. An unknown id starts at the first.
export function nextTheme(id, customThemes = []) {
  const ids = themeIds(customThemes);
  if (!ids.length) return id || 'dark';
  const i = ids.indexOf(id);
  return ids[(i + 1 + ids.length) % ids.length];
}

// The colour the page area is tinted with per theme (the paper itself always
// stays white so PDFs render truthfully).
export function isDarkTheme(id, customThemes = []) {
  const custom = normalizeCustomThemes(customThemes).find((t) => t.id === id);
  if (custom) return custom.kind === 'dark';
  return THEMES.find((t) => t.id === id)?.kind === 'dark';
}

export function applyCustomThemeVars(root, theme) {
  if (!root?.style) return;
  const vars = expandThemeColors(theme?.kind, theme?.colors);
  for (const key of THEME_VAR_KEYS) root.style.setProperty(key, vars[key]);
}

export function clearCustomThemeVars(root) {
  if (!root?.style) return;
  for (const key of THEME_VAR_KEYS) root.style.removeProperty(key);
}
