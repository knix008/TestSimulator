// Colour themes: twenty dark and twenty light palettes (the MyCAD set).
//
// A theme is a plain token set; the UI turns it into CSS custom properties, so
// adding a theme never needs a stylesheet change.

/**
 * Pastel palettes: every theme is built from a base hue, so the whole set keeps
 * the same soft, low-saturation character. Dark themes pair a deep muted base
 * with a light pastel accent, light themes a tinted off-white base with a
 * readable mid-tone accent. The two high-contrast themes stay sharp.
 */
export function hsl(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const dark = (id, ko, en, colors) => ({ id, mode: 'dark', name: { ko, en }, colors });
const light = (id, ko, en, colors) => ({ id, mode: 'light', name: { ko, en }, colors });

function pastelDark([id, ko, en, hue, sat, accent]) {
  return dark(id, ko, en, {
    bg: hsl(hue, sat, 12),
    panel: hsl(hue, sat, 17),
    panelAlt: hsl(hue, sat, 14),
    line: hsl(hue, Math.max(6, sat - 2), 27),
    text: hsl(hue, 22, 91),
    muted: hsl(hue, 16, 67),
    accent: hsl(accent, 58, 74),
    button: hsl(hue, sat, 21),
    danger: hsl(2, 58, 74),
    // The drawing area is its own surface, a clear step away from bg and panel.
    viewportA: hsl(hue, sat, 24),
    viewportB: hsl(hue, sat, 6),
    gridMajor: hsl(hue, 18, 40),
    gridMinor: hsl(hue, 16, 27),
  });
}

function pastelLight([id, ko, en, hue, sat, accent]) {
  return light(id, ko, en, {
    bg: hsl(hue, sat, 96),
    panel: hsl(hue, Math.max(20, sat - 8), 99),
    panelAlt: hsl(hue, sat, 93),
    line: hsl(hue, Math.max(10, sat - 12), 83),
    text: hsl(hue, 28, 23),
    muted: hsl(hue, 18, 46),
    // Dark enough on a near-white panel to clear the 3:1 contrast floor.
    accent: hsl(accent, 58, 38),
    button: hsl(hue, sat, 91),
    danger: hsl(2, 52, 52),
    // The drawing area is a tint darker than everything round it.
    viewportA: hsl(hue, sat, 88),
    viewportB: hsl(hue, sat, 77),
    gridMajor: hsl(hue, 24, 55),
    gridMinor: hsl(hue, 20, 70),
  });
}

const DARK_SPECS = [
  ['dark', '미드나이트', 'Midnight', 225, 18, 200],
  ['graphite', '그래파이트', 'Graphite', 220, 8, 210],
  ['blueprint', '청사진', 'Blueprint', 208, 26, 196],
  ['carbon', '카본', 'Carbon', 240, 6, 260],
  ['ocean', '오션', 'Ocean', 196, 24, 180],
  ['forest', '포레스트', 'Forest', 150, 20, 120],
  ['plum', '플럼', 'Plum', 296, 18, 320],
  ['ember', '엠버', 'Ember', 20, 20, 32],
  ['slate', '슬레이트', 'Slate', 212, 12, 205],
  ['cobalt', '코발트', 'Cobalt', 222, 28, 214],
  ['mocha', '모카', 'Mocha', 26, 16, 38],
  ['nord', '노르드', 'Nord', 215, 18, 193],
  ['dracula', '드라큘라', 'Dracula', 262, 18, 286],
  ['solarizedDark', '솔라라이즈드 다크', 'Solarized dark', 192, 22, 46],
  ['monokai', '모노카이', 'Monokai', 70, 10, 86],
  ['tealDark', '틸 다크', 'Teal dark', 176, 20, 166],
  ['roseDark', '로즈 다크', 'Rose dark', 340, 16, 348],
  ['amberDark', '앰버 다크', 'Amber dark', 40, 16, 44],
  ['steel', '스틸', 'Steel', 205, 10, 198],
];

const LIGHT_SPECS = [
  ['light', '데이라이트', 'Daylight', 210, 40, 205],
  ['paper', '페이퍼', 'Paper', 40, 30, 30],
  ['blueprintLight', '청사진 라이트', 'Blueprint light', 208, 46, 212],
  ['sand', '샌드', 'Sand', 36, 42, 28],
  ['mint', '민트', 'Mint', 156, 38, 164],
  ['sky', '스카이', 'Sky', 198, 48, 202],
  ['lavender', '라벤더', 'Lavender', 266, 36, 274],
  ['roseLight', '로즈 라이트', 'Rose light', 342, 40, 340],
  ['linen', '리넨', 'Linen', 32, 28, 24],
  ['cloud', '클라우드', 'Cloud', 214, 26, 208],
  ['solarizedLight', '솔라라이즈드 라이트', 'Solarized light', 46, 38, 196],
  ['sepia', '세피아', 'Sepia', 30, 34, 20],
  ['ice', '아이스', 'Ice', 190, 40, 186],
  ['meadow', '메도우', 'Meadow', 120, 34, 130],
  ['peach', '피치', 'Peach', 20, 46, 12],
  ['silver', '실버', 'Silver', 210, 10, 216],
  ['porcelain', '포슬린', 'Porcelain', 200, 16, 198],
  ['latte', '라떼', 'Latte', 28, 32, 22],
  ['graphiteLight', '그래파이트 라이트', 'Graphite light', 220, 10, 214],
];

export const THEMES = [
  ...DARK_SPECS.map(pastelDark),
  // Kept sharp on purpose: this one is the accessibility fallback.
  dark('contrast', '고대비', 'High contrast', {
    bg: '#000000', panel: '#000000', panelAlt: '#0a0a0a', line: '#ffffff', text: '#ffffff', muted: '#d0d0d0',
    accent: '#ffff00', button: '#101010', danger: '#ff5555', viewportA: '#1c1c1c', viewportB: '#000000',
    gridMajor: '#ffffff', gridMinor: '#6f6f6f',
  }),
  ...LIGHT_SPECS.map(pastelLight),
  light('contrastLight', '고대비 라이트', 'High contrast light', {
    bg: '#ffffff', panel: '#ffffff', panelAlt: '#ffffff', line: '#000000', text: '#000000', muted: '#333333',
    accent: '#0000ee', button: '#f0f0f0', danger: '#cc0000', viewportA: '#e4e4e4', viewportB: '#cfcfcf',
    gridMajor: '#000000', gridMinor: '#7a7a7a',
  }),
];

export const CUSTOM_THEME_ID = 'custom';

export function themeById(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function themesByMode(mode) {
  return THEMES.filter((theme) => theme.mode === mode);
}

/** CSS custom properties for a theme. */
export function themeVars(theme) {
  const c = theme.colors;
  return {
    '--bg': c.bg, '--panel': c.panel, '--panel-alt': c.panelAlt, '--line': c.line, '--text': c.text,
    '--muted': c.muted, '--accent': c.accent, '--button': c.button, '--danger': c.danger,
    '--viewport-a': c.viewportA, '--viewport-b': c.viewportB, '--grid-major': c.gridMajor, '--grid-minor': c.gridMinor,
  };
}

/** A starting point for the user's own theme: the default dark palette. */
export function createCustomTheme(base = THEMES[0]) {
  return { id: CUSTOM_THEME_ID, mode: base.mode, name: { ko: '사용자 정의', en: 'Custom' }, colors: { ...base.colors } };
}

export function sanitizeTheme(input) {
  const base = createCustomTheme();
  if (!input || typeof input !== 'object') return base;
  const colors = { ...base.colors };
  const source = input.colors ?? {};
  for (const key of Object.keys(colors)) {
    const value = source[key];
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) colors[key] = value;
  }
  return { id: CUSTOM_THEME_ID, mode: input.mode === 'light' ? 'light' : 'dark', name: base.name, colors };
}

/** The active theme, including the user's own. */
export function resolveTheme(id, custom) {
  if (id === CUSTOM_THEME_ID) return custom ? sanitizeTheme(custom) : createCustomTheme();
  return themeById(id);
}

export const THEME_TOKENS = [
  { key: 'bg', ko: '배경', en: 'Background' },
  { key: 'panel', ko: '패널', en: 'Panel' },
  { key: 'panelAlt', ko: '보조 패널', en: 'Side panel' },
  { key: 'line', ko: '경계선', en: 'Border' },
  { key: 'text', ko: '글자', en: 'Text' },
  { key: 'muted', ko: '흐린 글자', en: 'Muted text' },
  { key: 'accent', ko: '강조', en: 'Accent' },
  { key: 'button', ko: '버튼', en: 'Button' },
  { key: 'danger', ko: '경고', en: 'Danger' },
  { key: 'viewportA', ko: '뷰포트 중심', en: 'Viewport centre' },
  { key: 'viewportB', ko: '뷰포트 가장자리', en: 'Viewport edge' },
  { key: 'gridMajor', ko: '그리드 주선', en: 'Grid major' },
  { key: 'gridMinor', ko: '그리드 보조선', en: 'Grid minor' },
];
