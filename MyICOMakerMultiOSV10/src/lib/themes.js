// Colour themes: 20 dark, 20 light and one the user defines. Every theme is a set of CSS
// variables for the whole app — the main window, the canvas (checkerboard, grid, rulers), the
// settings, print and guide windows — so all windows look the same.
//
// Most themes are derived from a hue, a saturation and an accent colour (derive()); the custom
// theme starts from any theme and lets the user set each colour.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return [128, 128, 128];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
export const rgbToHex = (rgb) => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** a → b by t (0..1). */
export const mix = (a, b, t) => { const x = hexToRgb(a); const y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Black or white text, whichever reads better on the colour. */
export const textOn = (hex) => (luminance(hex) > 0.42 ? '#111827' : '#ffffff');
export const isDarkColor = (hex) => luminance(hex) < 0.2;

/** The colours a theme sets; the custom theme editor shows exactly these. */
export const THEME_KEYS = ['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent', 'accentText', 'hover', 'canvas', 'checkerA', 'checkerB', 'grid', 'ruler', 'shadow'];

/** Completes a theme from its main colours (bg, surface, text, accent, canvas): the rest follow. */
export function complete(vars, dark) {
  const v = { ...vars };
  v.surface2 ??= mix(v.surface, v.text, dark ? 0.05 : 0.025);
  v.border ??= mix(v.surface, v.text, dark ? 0.16 : 0.17);
  v.muted ??= mix(v.text, v.bg, dark ? 0.38 : 0.42);
  v.hover ??= mix(v.surface, v.accent, dark ? 0.16 : 0.1);
  v.accentText ??= textOn(v.accent);
  v.canvas ??= mix(v.bg, dark ? '#000000' : v.text, dark ? 0.3 : 0.07);
  v.checkerA ??= mix(v.canvas, v.text, dark ? 0.16 : 0.1);
  v.checkerB ??= mix(v.canvas, v.text, dark ? 0.1 : 0.04);
  v.grid ??= v.accent;
  v.ruler ??= mix(v.surface, v.bg, 0.5);
  v.shadow ??= dark ? 'rgba(0,0,0,0.45)' : 'rgba(30,50,90,0.16)';
  return Object.fromEntries(THEME_KEYS.map((k) => [k, v[k]]));
}

/** A theme from a hue, saturation and accent. */
function derive(id, dark, ko, en, hue, sat, accent) {
  const vars = dark
    ? { bg: hsl(hue, sat, 9), surface: hsl(hue, sat, 13), text: hsl(hue, Math.min(sat, 25), 92), accent }
    : { bg: hsl(hue, sat, 95), surface: hsl(hue, Math.min(sat, 40), 99.5), text: hsl(hue, Math.min(sat, 40), 14), accent };
  return { id, dark, name: { ko, en }, vars: complete(vars, dark) };
}

const DARK = [
  ['midnight', '미드나이트', 'Midnight', 218, 38, '#4f9cff'],
  ['graphite', '그래파이트', 'Graphite', 220, 6, '#ff8a3d'],
  ['ocean', '오션', 'Ocean', 195, 70, '#2dd4bf'],
  ['forest', '포레스트', 'Forest', 140, 30, '#5ee08a'],
  ['plum', '플럼', 'Plum', 275, 30, '#c084fc'],
  ['ember', '엠버', 'Ember', 12, 40, '#ff6b4a'],
  ['nord', '노르드', 'Nord', 220, 18, '#88c0d0'],
  ['dracula', '드라큘라', 'Vampire', 250, 22, '#ff79c6'],
  ['monokai', '모노카이', 'Monochrome Ink', 70, 8, '#a6e22e'],
  ['solarDark', '솔라 다크', 'Solar Dark', 192, 80, '#b58900'],
  ['cobalt', '코발트', 'Cobalt', 212, 70, '#ffc600'],
  ['cyber', '사이버', 'Cyber', 285, 45, '#00f0ff'],
  ['coffee', '커피', 'Coffee', 25, 25, '#e0a96d'],
  ['wine', '와인', 'Wine', 345, 35, '#ff5c8a'],
  ['teal', '틸', 'Teal', 175, 45, '#34d399'],
  ['slate', '슬레이트', 'Slate', 215, 16, '#60a5fa'],
  ['aurora', '오로라', 'Aurora', 200, 40, '#a3e635'],
  ['sakuraNight', '밤 벚꽃', 'Night Blossom', 330, 25, '#f9a8d4'],
  ['amberNight', '호박빛 밤', 'Amber Night', 35, 30, '#fbbf24'],
  ['highContrast', '고대비', 'High Contrast', 0, 0, '#ffff00'],
];
const LIGHT = [
  ['daylight', '데이라이트', 'Daylight', 215, 30, '#2563eb'],
  ['paper', '페이퍼', 'Paper', 40, 30, '#b45309'],
  ['sky', '스카이', 'Sky', 205, 70, '#0284c7'],
  ['mint', '민트', 'Mint', 155, 45, '#059669'],
  ['rose', '로즈', 'Rose', 345, 60, '#db2777'],
  ['sand', '샌드', 'Sand', 42, 45, '#ca8a04'],
  ['lavender', '라벤더', 'Lavender', 260, 50, '#7c3aed'],
  ['peach', '피치', 'Peach', 20, 80, '#ea580c'],
  ['lemon', '레몬', 'Lemon', 55, 80, '#a16207'],
  ['solarLight', '솔라 라이트', 'Solar Light', 44, 80, '#268bd2'],
  ['github', '깃허브', 'Clean White', 210, 10, '#0969da'],
  ['cloud', '클라우드', 'Cloud', 210, 20, '#6366f1'],
  ['sage', '세이지', 'Sage', 110, 20, '#4d7c0f'],
  ['coral', '코랄', 'Coral', 8, 70, '#e11d48'],
  ['ice', '아이스', 'Ice', 190, 60, '#0891b2'],
  ['cream', '크림', 'Cream', 48, 60, '#9a3412'],
  ['lilac', '라일락', 'Lilac', 290, 40, '#a21caf'],
  ['steel', '스틸', 'Steel', 215, 15, '#334155'],
  ['matcha', '말차', 'Matcha', 85, 35, '#65a30d'],
  ['print', '인쇄 용지', 'Print White', 0, 0, '#111827'],
];

export const THEMES = [
  ...DARK.map(([id, ko, en, h, s, a]) => derive(id, true, ko, en, h, s, a)),
  ...LIGHT.map(([id, ko, en, h, s, a]) => derive(id, false, ko, en, h, s, a)),
].map((t) => ({ ...t, swatch: [t.vars.bg, t.vars.surface, t.vars.accent] }));

export const DARK_THEMES = THEMES.filter((t) => t.dark);
export const LIGHT_THEMES = THEMES.filter((t) => !t.dark);
export const CUSTOM_ID = 'custom';

/** The custom theme: the user's colours over the theme it started from. */
export function customTheme(custom) {
  const base = THEMES.find((t) => t.id === custom?.base) ?? THEMES[0];
  const vars = { ...base.vars, ...(custom?.vars ?? {}) };
  const dark = custom?.dark ?? isDarkColor(vars.bg);
  return { id: CUSTOM_ID, dark, name: { ko: '사용자 정의', en: 'Custom' }, vars: complete(vars, dark), swatch: [vars.bg, vars.surface, vars.accent] };
}

export const themeById = (id, custom) => (id === CUSTOM_ID ? customTheme(custom) : THEMES.find((t) => t.id === id) ?? THEMES[0]);

const KEBAB = { accentText: 'accent-text', surface2: 'surface-2', checkerA: 'checker-a', checkerB: 'checker-b' };
export const cssName = (key) => `--${KEBAB[key] ?? key}`;

/** Sets the theme's variables on the document (every window calls this). */
export function applyTheme(id, root = globalThis.document?.documentElement, custom = null) {
  const t = themeById(id, custom);
  if (!root) return t;
  for (const [key, value] of Object.entries(t.vars)) root.style.setProperty(cssName(key), value);
  root.dataset.theme = t.id;
  root.dataset.dark = t.dark ? 'true' : 'false';
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  return t;
}
