// Colour themes: 20 light, 20 dark, "system" (follows the OS) and "custom"
// (colours chosen by the user in Settings). Each theme sets CSS custom
// properties on <html>; `dark` also picks the native title bar colour.

const base = {
  danger: '#e5484d', success: '#30a46c', warning: '#f5a524',
};

/** The colours a theme defines (the custom theme editor shows these). */
export const COLOR_KEYS = ['bg', 'surface', 'surface2', 'panel', 'text', 'muted', 'border', 'accent', 'accentText', 'hover', 'column', 'card', 'toolbar', 'status', 'shadow'];
/** Colours the user edits for a custom theme; the rest are derived from them. */
export const CUSTOM_KEYS = ['bg', 'surface', 'panel', 'text', 'muted', 'border', 'accent', 'accentText', 'column', 'card', 'toolbar', 'status'];

// ───────────────────────── colour helpers

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function hslToHex(h, s, l) {
  const sat = clamp(s / 100);
  const light = clamp(l / 100);
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex) {
  const value = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())?.[1];
  if (!value) return null;
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

/** Mixes two hex colours (amount 0 → a, 1 → b). */
export function mix(a, b, amount) {
  const x = hexToRgb(a) ?? [0, 0, 0];
  const y = hexToRgb(b) ?? [0, 0, 0];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** Relative luminance (0 black … 1 white). */
export function luminance(hex) {
  const rgb = (hexToRgb(hex) ?? [0, 0, 0]).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** A complete palette from a background hue, its saturation and an accent colour. */
function generated({ id, ko, en, dark, hue, sat = 40, accent, accentSat = 70, accentHue = hue }) {
  const h = (l, s = sat) => hslToHex(hue, s, l);
  const colors = dark
    ? {
      bg: h(9, sat * 0.45), surface: h(13, sat * 0.4), surface2: h(17, sat * 0.4), panel: h(11, sat * 0.42), text: h(92, 18), muted: h(66, 12),
      border: h(25, sat * 0.35), accent: accent ?? hslToHex(accentHue, accentSat, 66), accentText: hslToHex(accentHue, 45, 10), hover: h(21, sat * 0.4),
      column: h(15, sat * 0.4), card: h(19, sat * 0.4), toolbar: h(13, sat * 0.4), status: h(11, sat * 0.42), shadow: 'rgba(0,0,0,0.45)',
    }
    : {
      bg: h(94, sat * 0.55), surface: h(99.5, sat * 0.3), surface2: h(96.5, sat * 0.45), panel: h(97.5, sat * 0.45), text: h(16, 30), muted: h(42, 14),
      border: h(85, sat * 0.4), accent: accent ?? hslToHex(accentHue, accentSat, 44), accentText: '#ffffff', hover: h(91, sat * 0.6),
      column: h(90, sat * 0.5), card: h(99.5, sat * 0.25), toolbar: h(99.5, sat * 0.3), status: h(95.5, sat * 0.45), shadow: 'rgba(20,30,50,0.13)',
    };
  // Keep text on the accent colour readable: darken (light themes) or lighten (dark themes) the accent until it is.
  if (!accent) {
    for (let l = dark ? 66 : 44; contrast(colors.accentText, colors.accent) < 4.5 && l > 20 && l < 90; l += dark ? 2 : -2) {
      colors.accent = hslToHex(accentHue, accentSat, l);
    }
  }
  return { id, name: { ko, en }, dark, colors };
}

const hand = (id, ko, en, dark, colors) => ({ id, name: { ko, en }, dark, colors });

// ───────────────────────── 20 light themes

export const LIGHT_THEMES = [
  hand('light', '라이트', 'Light', false, {
    bg: '#eef2f8', surface: '#ffffff', surface2: '#f4f6fb', panel: '#f8fafd', text: '#1d2433', muted: '#667085', border: '#d9dfea',
    accent: '#3a6cf0', accentText: '#ffffff', hover: '#e8eefc', column: '#e6ebf4', card: '#ffffff', toolbar: '#ffffff', status: '#f1f4fa', shadow: 'rgba(16,24,40,0.12)' }),
  hand('ocean', '오션', 'Ocean', false, {
    bg: '#e3f2f8', surface: '#ffffff', surface2: '#eef8fb', panel: '#f2fafd', text: '#0f2c3a', muted: '#4f7383', border: '#c4e0ea',
    accent: '#0e8fb8', accentText: '#ffffff', hover: '#dcf0f7', column: '#d4ebf3', card: '#ffffff', toolbar: '#ffffff', status: '#e9f5f9', shadow: 'rgba(14,60,80,0.14)' }),
  hand('forest', '포레스트', 'Forest', false, {
    bg: '#e9f1e6', surface: '#ffffff', surface2: '#f1f7ef', panel: '#f5faf3', text: '#1c2e20', muted: '#5b7461', border: '#cfe0c9',
    accent: '#2f8a4c', accentText: '#ffffff', hover: '#e1eedc', column: '#dbe8d5', card: '#ffffff', toolbar: '#ffffff', status: '#edf4ea', shadow: 'rgba(30,60,30,0.14)' }),
  hand('sunset', '선셋', 'Sunset', false, {
    bg: '#fbeee6', surface: '#ffffff', surface2: '#fdf4ef', panel: '#fef8f4', text: '#3a1f12', muted: '#8a6151', border: '#f0d5c6',
    accent: '#e2602b', accentText: '#ffffff', hover: '#fbe5d9', column: '#f6e1d4', card: '#ffffff', toolbar: '#ffffff', status: '#fcf0e9', shadow: 'rgba(90,40,20,0.14)' }),
  hand('solarized', '솔라라이즈드', 'Solarized', false, {
    bg: '#f5efdc', surface: '#fdf6e3', surface2: '#f3ecd6', panel: '#faf3df', text: '#3c4a50', muted: '#6f7f82', border: '#e0d8bf',
    accent: '#268bd2', accentText: '#ffffff', hover: '#ece4cb', column: '#eee8d5', card: '#fdf6e3', toolbar: '#fdf6e3', status: '#f3ecd6', shadow: 'rgba(80,70,40,0.14)' }),
  hand('sepia', '세피아', 'Sepia', false, {
    bg: '#efe5d4', surface: '#fbf6ee', surface2: '#f4ecdf', panel: '#f8f1e6', text: '#3d2e1e', muted: '#7d6a55', border: '#e0d2bb',
    accent: '#9c6b3c', accentText: '#ffffff', hover: '#eee2cd', column: '#e9dcc6', card: '#fdf9f2', toolbar: '#fbf6ee', status: '#f4ecdf', shadow: 'rgba(80,60,30,0.15)' }),
  generated({ id: 'lavender', ko: '라벤더', en: 'Lavender', dark: false, hue: 262, sat: 55, accentSat: 55 }),
  generated({ id: 'rose', ko: '로즈', en: 'Rose', dark: false, hue: 345, sat: 60, accentSat: 62 }),
  generated({ id: 'mint', ko: '민트', en: 'Mint', dark: false, hue: 160, sat: 45, accentSat: 60, accentHue: 165 }),
  generated({ id: 'sand', ko: '샌드', en: 'Sand', dark: false, hue: 38, sat: 45, accentSat: 60, accentHue: 28 }),
  generated({ id: 'sky', ko: '스카이', en: 'Sky', dark: false, hue: 205, sat: 70, accentSat: 75 }),
  generated({ id: 'peach', ko: '피치', en: 'Peach', dark: false, hue: 20, sat: 70, accentSat: 70, accentHue: 12 }),
  generated({ id: 'lime', ko: '라임', en: 'Lime', dark: false, hue: 85, sat: 45, accentSat: 65, accentHue: 95 }),
  generated({ id: 'coral', ko: '코랄', en: 'Coral', dark: false, hue: 8, sat: 55, accentSat: 70 }),
  generated({ id: 'paper', ko: '페이퍼', en: 'Paper', dark: false, hue: 40, sat: 8, accentSat: 15, accentHue: 220, accent: '#41566e' }),
  generated({ id: 'grape', ko: '그레이프', en: 'Grape', dark: false, hue: 285, sat: 45, accentSat: 55 }),
  generated({ id: 'honey', ko: '허니', en: 'Honey', dark: false, hue: 46, sat: 75, accentSat: 85, accentHue: 38 }),
  generated({ id: 'cloud', ko: '클라우드', en: 'Cloud', dark: false, hue: 220, sat: 18, accentSat: 45 }),
  generated({ id: 'blossom', ko: '블로섬', en: 'Blossom', dark: false, hue: 325, sat: 55, accentSat: 55, accentHue: 330 }),
  generated({ id: 'teal', ko: '틸', en: 'Teal', dark: false, hue: 178, sat: 50, accentSat: 70 }),
];

// ───────────────────────── 20 dark themes

export const DARK_THEMES = [
  hand('dark', '다크', 'Dark', true, {
    bg: '#15181e', surface: '#1f232c', surface2: '#272c37', panel: '#1b1f27', text: '#e6e9ef', muted: '#98a1b3', border: '#343b49',
    accent: '#6e9bff', accentText: '#0b1020', hover: '#2c3342', column: '#232834', card: '#2b3140', toolbar: '#1f232c', status: '#1b1f27', shadow: 'rgba(0,0,0,0.45)' }),
  hand('midnight', '미드나이트', 'Midnight', true, {
    bg: '#0b1020', surface: '#141b33', surface2: '#1b2443', panel: '#10172c', text: '#e3e7ff', muted: '#8f98c7', border: '#273259',
    accent: '#8b7bff', accentText: '#0b1020', hover: '#202a50', column: '#151d38', card: '#1d2747', toolbar: '#141b33', status: '#10172c', shadow: 'rgba(0,0,0,0.5)' }),
  hand('nord', '노르드', 'Nord', true, {
    bg: '#2a303b', surface: '#323946', surface2: '#3b4252', panel: '#2e3440', text: '#eceff4', muted: '#a7b1c4', border: '#4c566a',
    accent: '#88c0d0', accentText: '#1d222b', hover: '#434c5e', column: '#353c4a', card: '#3e4657', toolbar: '#323946', status: '#2e3440', shadow: 'rgba(0,0,0,0.4)' }),
  hand('dracula', '드라큘라', 'Dracula', true, {
    bg: '#21222c', surface: '#2b2d3a', surface2: '#343746', panel: '#262833', text: '#f8f8f2', muted: '#a4a8c8', border: '#44475a',
    accent: '#ff79c6', accentText: '#21222c', hover: '#3b3e51', column: '#2e3040', card: '#383a4c', toolbar: '#2b2d3a', status: '#262833', shadow: 'rgba(0,0,0,0.45)' }),
  hand('contrast', '고대비', 'High contrast', true, {
    bg: '#000000', surface: '#0a0a0a', surface2: '#141414', panel: '#050505', text: '#ffffff', muted: '#d0d0d0', border: '#ffffff',
    accent: '#ffd400', accentText: '#000000', hover: '#262626', column: '#0f0f0f', card: '#161616', toolbar: '#0a0a0a', status: '#050505', shadow: 'rgba(255,255,255,0.15)' }),
  generated({ id: 'monokai', ko: '모노카이', en: 'Monokai', dark: true, hue: 60, sat: 10, accent: '#a6e22e' }),
  generated({ id: 'onedark', ko: '원 다크', en: 'One Dark', dark: true, hue: 220, sat: 22, accentHue: 207, accentSat: 80 }),
  generated({ id: 'gruvbox', ko: '그루브박스', en: 'Gruvbox', dark: true, hue: 35, sat: 18, accent: '#fabd2f' }),
  generated({ id: 'tokyo', ko: '도쿄 나이트', en: 'Tokyo Night', dark: true, hue: 235, sat: 30, accentHue: 225, accentSat: 85 }),
  generated({ id: 'deepocean', ko: '딥 오션', en: 'Deep Ocean', dark: true, hue: 205, sat: 45, accentHue: 190, accentSat: 75 }),
  generated({ id: 'forestnight', ko: '포레스트 나이트', en: 'Forest Night', dark: true, hue: 145, sat: 25, accentHue: 140, accentSat: 50 }),
  generated({ id: 'wine', ko: '와인', en: 'Wine', dark: true, hue: 345, sat: 35, accentHue: 350, accentSat: 75 }),
  generated({ id: 'slate', ko: '슬레이트', en: 'Slate', dark: true, hue: 215, sat: 15, accentHue: 210, accentSat: 55 }),
  generated({ id: 'cocoa', ko: '코코아', en: 'Cocoa', dark: true, hue: 25, sat: 25, accentHue: 32, accentSat: 60 }),
  generated({ id: 'neon', ko: '네온', en: 'Neon', dark: true, hue: 285, sat: 40, accent: '#39ff88' }),
  generated({ id: 'deeppurple', ko: '딥 퍼플', en: 'Deep Purple', dark: true, hue: 265, sat: 40, accentHue: 270, accentSat: 80 }),
  generated({ id: 'carbon', ko: '카본', en: 'Carbon', dark: true, hue: 0, sat: 0, accentHue: 205, accentSat: 70 }),
  generated({ id: 'ambernight', ko: '앰버 나이트', en: 'Amber Night', dark: true, hue: 30, sat: 20, accentHue: 38, accentSat: 95 }),
  generated({ id: 'tealnight', ko: '틸 나이트', en: 'Teal Night', dark: true, hue: 185, sat: 35, accentHue: 172, accentSat: 65 }),
  generated({ id: 'rosenight', ko: '로즈 나이트', en: 'Rose Night', dark: true, hue: 330, sat: 25, accentHue: 335, accentSat: 75 }),
];

for (const theme of [...LIGHT_THEMES, ...DARK_THEMES]) theme.swatch = [theme.colors.bg, theme.colors.surface, theme.colors.accent];

export const THEMES = [...LIGHT_THEMES, ...DARK_THEMES];
export const SYSTEM = 'system';
export const CUSTOM = 'custom';
export const THEME_IDS = [SYSTEM, ...THEMES.map((theme) => theme.id), CUSTOM];

// ───────────────────────── custom theme

/** The custom theme the user starts from: a copy of a built-in theme's colours. */
export function customFrom(theme) {
  return { dark: theme.dark, ...Object.fromEntries(CUSTOM_KEYS.map((key) => [key, theme.colors[key]])) };
}

export function normalizeCustom(raw) {
  const fallback = customFrom(LIGHT_THEMES[0]);
  if (!raw || typeof raw !== 'object') return fallback;
  const out = { dark: typeof raw.dark === 'boolean' ? raw.dark : fallback.dark };
  for (const key of CUSTOM_KEYS) out[key] = hexToRgb(raw[key]) ? String(raw[key]).toLowerCase() : fallback[key];
  return out;
}

export function customTheme(raw) {
  const c = normalizeCustom(raw);
  const colors = {
    ...Object.fromEntries(CUSTOM_KEYS.map((key) => [key, c[key]])),
    surface2: mix(c.surface, c.text, 0.05),
    hover: mix(c.surface, c.accent, c.dark ? 0.18 : 0.1),
    shadow: c.dark ? 'rgba(0,0,0,0.45)' : 'rgba(16,24,40,0.12)',
  };
  return { id: CUSTOM, name: { ko: '사용자 정의', en: 'Custom' }, dark: c.dark, colors, swatch: [colors.bg, colors.surface, colors.accent] };
}

// ───────────────────────── lookup & applying

export function resolveTheme(id, prefersDark = false, custom = null) {
  if (id === CUSTOM) return customTheme(custom);
  if (id === SYSTEM) return THEMES.find((theme) => theme.id === (prefersDark ? 'dark' : 'light'));
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/** Display name of a theme id in the given language. */
export function themeName(id, language = 'ko') {
  if (id === SYSTEM) return language === 'en' ? 'System setting' : '시스템 설정';
  if (id === CUSTOM) return language === 'en' ? 'Custom' : '사용자 정의';
  const theme = THEMES.find((item) => item.id === id);
  return theme ? theme.name[language === 'en' ? 'en' : 'ko'] : id;
}

/** The theme after `id` for the toolbar's theme button (all light, all dark, then custom). */
export function nextThemeId(id) {
  const order = [...THEMES.map((theme) => theme.id), CUSTOM];
  const index = order.indexOf(id === SYSTEM ? 'light' : id);
  return order[(index + 1) % order.length];
}

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeVariables(theme) {
  return Object.fromEntries(Object.entries({ ...base, ...theme.colors }).map(([key, value]) => [`--${kebab(key)}`, value]));
}

export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}

export function applyFont(settings, root = globalThis.document?.documentElement) {
  if (!root) return;
  const family = settings.fontFamily ? `"${settings.fontFamily.replace(/"/g, '')}", ` : '';
  root.style.setProperty('--font-family', `${family}"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`);
  root.style.setProperty('--font-size', `${settings.fontSize}px`);
  root.style.setProperty('--font-weight', String(settings.fontWeight));
  root.style.setProperty('--font-style', settings.fontStyle);
}
