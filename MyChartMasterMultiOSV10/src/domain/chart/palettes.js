// Colour palettes for chart series: categorical sets for series and slices, and sequential / diverging ramps
// for heat maps. Each palette: { id, ko, en, colors }. `seriesColor(options, i, theme)` picks a colour.

export const PALETTES = [
  { id: 'vivid', ko: '선명', en: 'Vivid', colors: ['#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#eab308', '#06b6d4', '#ec4899', '#84cc16', '#64748b'] },
  { id: 'office', ko: '오피스', en: 'Office', colors: ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300'] },
  { id: 'tableau', ko: '태블로', en: 'Tableau 10', colors: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'] },
  { id: 'category10', ko: '기본 10색', en: 'Category 10', colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'] },
  { id: 'pastel', ko: '파스텔', en: 'Pastel', colors: ['#a3c4f3', '#ffcfa3', '#b9e4c9', '#f7a8a8', '#cdb4db', '#fde2a4', '#a0e7e5', '#ffc8dd', '#d3f8a3', '#c9ccd5'] },
  { id: 'earth', ko: '대지', en: 'Earth', colors: ['#8c6d46', '#b5a46a', '#6b8e5a', '#c97b4a', '#4f6d7a', '#d9b36c', '#a65e46', '#7c9a92', '#5e4b3c', '#bfa48c'] },
  { id: 'ocean', ko: '바다', en: 'Ocean', colors: ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#023e8a', '#0096c7', '#ade8f4', '#2a6f97', '#61a5c2'] },
  { id: 'sunset', ko: '노을', en: 'Sunset', colors: ['#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e', '#577590', '#277da1'] },
  { id: 'forest', ko: '숲', en: 'Forest', colors: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#386641', '#6a994e', '#a7c957'] },
  { id: 'berry', ko: '베리', en: 'Berry', colors: ['#6a0d83', '#ce4993', '#ee5d6c', '#fb9062', '#eeaf61', '#9b2c6f', '#5c3c92', '#d1495b', '#edae49', '#00798c'] },
  { id: 'neon', ko: '네온', en: 'Neon', colors: ['#00f5d4', '#00bbf9', '#fee440', '#f15bb5', '#9b5de5', '#fb5607', '#3a86ff', '#8338ec', '#ff006e', '#06d6a0'] },
  { id: 'mono', ko: '단색 파랑', en: 'Mono blue', colors: ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#1e3a8a', '#3b82f6', '#93c5fd'] },
  { id: 'gray', ko: '회색조', en: 'Grayscale', colors: ['#111827', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#1f2937', '#4b5563', '#a3a3a3', '#525252', '#e5e7eb'] },
  { id: 'warm', ko: '따뜻한', en: 'Warm', colors: ['#7f1d1d', '#b91c1c', '#ef4444', '#f97316', '#f59e0b', '#fbbf24', '#fde68a', '#9a3412', '#c2410c', '#fb923c'] },
  { id: 'cool', ko: '차가운', en: 'Cool', colors: ['#1e3a8a', '#2563eb', '#0891b2', '#0d9488', '#059669', '#4f46e5', '#7c3aed', '#38bdf8', '#2dd4bf', '#a78bfa'] },
  { id: 'colorblind', ko: '색각 친화', en: 'Colour-blind safe', colors: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#56b4e9', '#d55e00', '#f0e442', '#000000', '#999999', '#882255'] },
  { id: 'retro', ko: '레트로', en: 'Retro', colors: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#073b4c', '#f78c6b', '#83d483', '#0cb0a9', '#ffb703', '#8ecae6'] },
  { id: 'corporate', ko: '비즈니스', en: 'Corporate', colors: ['#0b3c5d', '#328cc1', '#d9b310', '#1d2731', '#6c8ea0', '#a3bbc8', '#c46c3b', '#5c8a3a', '#8b6f47', '#3c6e71'] },
  { id: 'candy', ko: '사탕', en: 'Candy', colors: ['#ff99c8', '#fcf6bd', '#d0f4de', '#a9def9', '#e4c1f9', '#ffb4a2', '#b5e48c', '#99d98c', '#ffc6ff', '#bdb2ff'] },
  { id: 'night', ko: '밤하늘', en: 'Night sky', colors: ['#7dd3fc', '#c084fc', '#f472b6', '#facc15', '#4ade80', '#fb7185', '#38bdf8', '#a3e635', '#f97316', '#e879f9'] },
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);
export const palette = (id) => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** Sequential ramps for heat maps: [low, high] (mixed in between) or three stops for diverging. */
export const RAMPS = {
  blues: ['#eff6ff', '#1d4ed8'],
  greens: ['#f0fdf4', '#15803d'],
  reds: ['#fff1f2', '#be123c'],
  purples: ['#faf5ff', '#7e22ce'],
  oranges: ['#fff7ed', '#c2410c'],
  viridis: ['#440154', '#21908d', '#fde725'],
  diverging: ['#2563eb', '#f8fafc', '#dc2626'],
  heat: ['#fef9c3', '#f97316', '#7f1d1d'],
};
export const RAMP_IDS = Object.keys(RAMPS);

const hex = (color) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return [128, 128, 128];
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

export function mix(a, b, t) {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** A colour on a ramp for t in [0, 1]. */
export function rampColor(id, t) {
  const stops = RAMPS[id] ?? RAMPS.blues;
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const span = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(span));
  return mix(stops[i], stops[i + 1], span - i);
}

/** Black or white, whichever reads better on `color`. */
export function readableOn(color) {
  const [r, g, b] = hex(color).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#ffffff';
}

export const lighten = (color, t) => mix(color, '#ffffff', t);
export const darken = (color, t) => mix(color, '#000000', t);

/** The colour of series (or slice) i: the user's own choice for it, else the palette's, cycling with shades. */
export function seriesColor(options, i) {
  const own = options?.colors?.[i];
  if (own && /^#[0-9a-f]{6}$/i.test(own)) return own;
  const colors = palette(options?.palette).colors;
  const base = colors[i % colors.length];
  const round = Math.floor(i / colors.length);
  const color = round ? (round % 2 ? darken(base, 0.25) : lighten(base, 0.3)) : base;
  return options?._bg ? visibleOn(color, options._bg) : color;
}

const luminance = (color) => { const [r, g, b] = hex(color).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** WCAG contrast ratio of two colours. */
export const contrastRatio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** A palette colour made lighter (dark paper) or darker (light paper) until it stands out from `bg` (ratio ≥ 3). */
export function visibleOn(color, bg, min = 3) {
  if (!/^#[0-9a-f]{6}$/i.test(String(bg)) || contrastRatio(color, bg) >= min) return color;
  const toward = luminance(bg) < 0.25 ? '#ffffff' : '#000000';
  for (let t = 0.1; t <= 0.8; t += 0.1) { const c = mix(color, toward, t); if (contrastRatio(c, bg) >= min) return c; }
  return mix(color, toward, 0.8);
}

// ───────────────────────── chart themes (each chart has its own, independent of the program's theme)

const T = (id, ko, en, bg, text, muted, grid, axis, palette, extra = {}) => ({ id, ko, en, bg, text, muted, grid, axis, palette, ...extra });
/** A chart theme: background, text, muted text, grid, axis, its palette and (optionally) a font and dashed grid. */
export const CHART_THEMES = [
  T('classic', '클래식', 'Classic', '#ffffff', '#1f2937', '#6b7280', 'rgba(15,23,42,0.1)', 'rgba(15,23,42,0.35)', 'vivid'),
  T('office', '오피스', 'Office', '#ffffff', '#262626', '#595959', '#d9d9d9', '#bfbfbf', 'office'),
  T('paper', '종이', 'Paper', '#fbf8f1', '#3b3024', '#7c6f5f', 'rgba(59,48,36,0.12)', 'rgba(59,48,36,0.4)', 'earth', { font: "Georgia, 'Nanum Myeongjo', 'Batang', serif" }),
  T('newspaper', '신문', 'Newspaper', '#fffdf5', '#111111', '#555555', 'rgba(0,0,0,0.12)', '#111111', 'gray', { font: "'Times New Roman', 'Batang', serif", gridDash: '2 3' }),
  T('pastel', '파스텔', 'Pastel', '#fdfcff', '#4b5563', '#9ca3af', 'rgba(75,85,99,0.08)', 'rgba(75,85,99,0.25)', 'pastel'),
  T('ocean', '바다', 'Ocean', '#f0f9ff', '#0c4a6e', '#0369a1', 'rgba(3,105,161,0.12)', 'rgba(12,74,110,0.4)', 'ocean'),
  T('forest', '숲', 'Forest', '#f3faf4', '#14532d', '#3f6f4e', 'rgba(20,83,45,0.1)', 'rgba(20,83,45,0.4)', 'forest'),
  T('sunset', '노을', 'Sunset', '#fff7ed', '#7c2d12', '#9a5b3c', 'rgba(124,45,18,0.1)', 'rgba(124,45,18,0.4)', 'sunset'),
  T('corporate', '비즈니스', 'Corporate', '#ffffff', '#0b3c5d', '#5b7083', 'rgba(11,60,93,0.1)', 'rgba(11,60,93,0.45)', 'corporate', { gridDash: '4 4' }),
  T('monochrome', '흑백', 'Monochrome', '#ffffff', '#111111', '#6b6b6b', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.5)', 'gray'),
  T('colorblind', '색각 친화', 'Colour-blind safe', '#ffffff', '#1f2937', '#6b7280', 'rgba(15,23,42,0.1)', 'rgba(15,23,42,0.35)', 'colorblind'),
  T('solarizedLight', '솔라라이즈드 밝게', 'Solarized light', '#fdf6e3', '#586e75', '#93a1a1', 'rgba(88,110,117,0.15)', 'rgba(88,110,117,0.45)', 'retro'),
  T('nordic', '북유럽', 'Nordic', '#eceff4', '#2e3440', '#4c566a', 'rgba(46,52,64,0.1)', 'rgba(46,52,64,0.4)', 'cool'),
  T('dark', '어둡게', 'Dark', '#111827', '#e5e7eb', '#9ca3af', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.35)', 'night'),
  T('midnight', '한밤', 'Midnight', '#0b1020', '#dbe4ff', '#8ea0c9', 'rgba(219,228,255,0.1)', 'rgba(219,228,255,0.35)', 'neon'),
  T('slate', '슬레이트', 'Slate', '#1e293b', '#e2e8f0', '#94a3b8', 'rgba(226,232,240,0.1)', 'rgba(226,232,240,0.35)', 'cool'),
  T('solarizedDark', '솔라라이즈드 어둡게', 'Solarized dark', '#002b36', '#93a1a1', '#657b83', 'rgba(147,161,161,0.15)', 'rgba(147,161,161,0.4)', 'retro'),
  T('vampire', '뱀파이어', 'Vampire', '#282a36', '#f8f8f2', '#a3a3c2', 'rgba(248,248,242,0.1)', 'rgba(248,248,242,0.35)', 'berry'),
  T('neonDark', '네온', 'Neon', '#0a0a0a', '#f5f5f5', '#a3a3a3', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.3)', 'neon'),
  T('blueprint', '청사진', 'Blueprint', '#0b3d91', '#e0ecff', '#a9c3f0', 'rgba(224,236,255,0.25)', 'rgba(224,236,255,0.6)', 'candy', { font: "Consolas, 'D2Coding', monospace", gridDash: '3 3' }),
  T('chalkboard', '칠판', 'Chalkboard', '#1f3a2e', '#f1f5f9', '#c7d2c9', 'rgba(241,245,249,0.15)', 'rgba(241,245,249,0.45)', 'candy', { font: "'Comic Sans MS', 'Nanum Pen Script', cursive", gridDash: '6 4' }),
  // more light themes
  T('rose', '장미', 'Rose', '#fff1f2', '#881337', '#9f1239', 'rgba(136,19,55,0.1)', 'rgba(136,19,55,0.4)', 'berry'),
  T('lavender', '라벤더', 'Lavender', '#f5f3ff', '#4c1d95', '#6d28d9', 'rgba(76,29,149,0.1)', 'rgba(76,29,149,0.4)', 'pastel'),
  T('mint', '민트', 'Mint', '#f0fdfa', '#134e4a', '#0f766e', 'rgba(19,78,74,0.1)', 'rgba(19,78,74,0.4)', 'ocean'),
  T('sand', '모래', 'Sand', '#faf6ec', '#4a3f2a', '#8a7a5c', 'rgba(74,63,42,0.12)', 'rgba(74,63,42,0.4)', 'earth'),
  T('sky', '하늘', 'Sky', '#eff6ff', '#1e3a8a', '#3b5bdb', 'rgba(30,58,138,0.1)', 'rgba(30,58,138,0.4)', 'cool'),
  T('citrus', '시트러스', 'Citrus', '#fefce8', '#3f3a0b', '#7a6f1a', 'rgba(63,58,11,0.1)', 'rgba(63,58,11,0.4)', 'warm'),
  T('tableau', '태블로', 'Tableau', '#ffffff', '#333333', '#777777', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.35)', 'tableau'),
  T('academic', '논문', 'Academic', '#ffffff', '#000000', '#444444', 'rgba(0,0,0,0.15)', '#000000', 'category10', { font: "'Times New Roman', 'Batang', serif", gridDash: '1 3' }),
  T('minimal', '미니멀', 'Minimal', '#ffffff', '#374151', '#9ca3af', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.2)', 'mono'),
  T('candy', '사탕', 'Candy', '#fff7fb', '#6b2147', '#a0577e', 'rgba(107,33,71,0.1)', 'rgba(107,33,71,0.35)', 'candy'),
  T('retro', '레트로', 'Retro', '#f4ecd8', '#3e2f1c', '#7d6748', 'rgba(62,47,28,0.14)', 'rgba(62,47,28,0.45)', 'retro', { font: "'Courier New', 'D2Coding', monospace" }),
  T('highContrast', '고대비', 'High contrast', '#ffffff', '#000000', '#000000', 'rgba(0,0,0,0.25)', '#000000', 'colorblind'),
  T('peach', '복숭아', 'Peach', '#fff5ee', '#7a3b1e', '#a0674a', 'rgba(122,59,30,0.1)', 'rgba(122,59,30,0.4)', 'sunset'),
  T('sage', '세이지', 'Sage', '#f4f7f0', '#2f3e2c', '#6b7d65', 'rgba(47,62,44,0.1)', 'rgba(47,62,44,0.4)', 'forest'),
  T('arctic', '극지', 'Arctic', '#f5fbff', '#0f2a3d', '#5a7487', 'rgba(15,42,61,0.1)', 'rgba(15,42,61,0.4)', 'cool'),
  T('blossom', '벚꽃', 'Blossom', '#fdf2f8', '#701a4f', '#a0527f', 'rgba(112,26,79,0.1)', 'rgba(112,26,79,0.35)', 'candy'),
  T('linen', '리넨', 'Linen', '#faf7f2', '#3a3530', '#857b70', 'rgba(58,53,48,0.12)', 'rgba(58,53,48,0.4)', 'tableau', { gridDash: '3 3' }),
  // more dark themes
  T('charcoal', '숯', 'Charcoal', '#262626', '#f5f5f5', '#a3a3a3', 'rgba(245,245,245,0.1)', 'rgba(245,245,245,0.35)', 'vivid'),
  T('deepSea', '심해', 'Deep sea', '#071a2b', '#d6ecff', '#7fa8c9', 'rgba(214,236,255,0.1)', 'rgba(214,236,255,0.35)', 'ocean'),
  T('nightForest', '밤 숲', 'Night forest', '#0f1f17', '#e3f1e8', '#8fb39c', 'rgba(227,241,232,0.1)', 'rgba(227,241,232,0.35)', 'forest'),
  T('ember', '잉걸불', 'Ember', '#1c1210', '#ffe8dc', '#c79a86', 'rgba(255,232,220,0.1)', 'rgba(255,232,220,0.35)', 'sunset'),
  T('plum', '자두', 'Plum', '#2a1630', '#f6e8fb', '#c3a3cf', 'rgba(246,232,251,0.1)', 'rgba(246,232,251,0.35)', 'berry'),
  T('terminal', '터미널', 'Terminal', '#000000', '#33ff66', '#1fae47', 'rgba(51,255,102,0.15)', 'rgba(51,255,102,0.45)', 'neon', { font: "Consolas, 'D2Coding', monospace" }),
  T('officeDark', '오피스 어둡게', 'Office dark', '#1f1f1f', '#f0f0f0', '#a6a6a6', 'rgba(240,240,240,0.1)', 'rgba(240,240,240,0.35)', 'office'),
  T('coffee', '커피', 'Coffee', '#2b211b', '#f3e9df', '#bfa995', 'rgba(243,233,223,0.1)', 'rgba(243,233,223,0.35)', 'earth'),
  T('graphite', '흑연', 'Graphite', '#1b1d22', '#e6e8ec', '#9aa1ad', 'rgba(230,232,236,0.1)', 'rgba(230,232,236,0.35)', 'cool'),
  T('aurora', '오로라', 'Aurora', '#0b1622', '#e6fff7', '#8cc7b5', 'rgba(230,255,247,0.1)', 'rgba(230,255,247,0.35)', 'forest'),
  T('wine', '와인', 'Wine', '#240b12', '#fbe9ee', '#c9909e', 'rgba(251,233,238,0.1)', 'rgba(251,233,238,0.35)', 'berry'),
  T('navy', '남색', 'Navy', '#0a1931', '#e3ecff', '#8fa7d6', 'rgba(227,236,255,0.1)', 'rgba(227,236,255,0.35)', 'corporate'),
  T('tableauDark', '태블로 어둡게', 'Tableau dark', '#1e1e1e', '#eeeeee', '#9e9e9e', 'rgba(238,238,238,0.1)', 'rgba(238,238,238,0.35)', 'tableau'),
  T('pastelDark', '파스텔 어둡게', 'Pastel dark', '#22212b', '#f1eff8', '#b5b1c9', 'rgba(241,239,248,0.1)', 'rgba(241,239,248,0.35)', 'pastel'),
  T('desertNight', '사막의 밤', 'Desert night', '#231a12', '#fdf1e1', '#c9ad8c', 'rgba(253,241,225,0.1)', 'rgba(253,241,225,0.35)', 'warm'),
  T('highContrastDark', '고대비 어둡게', 'High contrast dark', '#000000', '#ffffff', '#ffffff', 'rgba(255,255,255,0.3)', '#ffffff', 'colorblind'),
  T('cyberpunk', '사이버펑크', 'Cyberpunk', '#120424', '#fdf0ff', '#c79ae0', 'rgba(253,240,255,0.1)', 'rgba(253,240,255,0.35)', 'neon', { gridDash: '2 4' }),
  T('obsidian', '흑요석', 'Obsidian', '#0d0d12', '#ececf3', '#9a9aae', 'rgba(236,236,243,0.1)', 'rgba(236,236,243,0.35)', 'vivid'),
  T('moss', '이끼', 'Moss', '#1a2318', '#e8f0e2', '#a3b59a', 'rgba(232,240,226,0.1)', 'rgba(232,240,226,0.35)', 'earth'),
  T('twilight', '황혼', 'Twilight', '#1d1533', '#f0e9ff', '#ad9fd1', 'rgba(240,233,255,0.1)', 'rgba(240,233,255,0.35)', 'sunset'),
  T('steel', '강철', 'Steel', '#1c232b', '#e4eaf0', '#94a3b4', 'rgba(228,234,240,0.1)', 'rgba(228,234,240,0.35)', 'category10', { gridDash: '4 4' }),
  T('lava', '용암', 'Lava', '#1a0a05', '#fff0e6', '#d19a80', 'rgba(255,240,230,0.1)', 'rgba(255,240,230,0.35)', 'warm'),
];
export const CHART_THEME_IDS = CHART_THEMES.map((t) => t.id);
/** Whether a chart theme has a dark paper (relative luminance under 0.35). */
export function isDarkChartTheme(theme) {
  const m = /^#?([0-9a-f]{6})$/i.exec(theme.bg ?? '');
  if (!m) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}
/** The chart themes grouped: light papers, then dark ones (the Style tab shows them so). */
export const LIGHT_CHART_THEMES = CHART_THEMES.filter((t) => !isDarkChartTheme(t));
export const DARK_CHART_THEMES = CHART_THEMES.filter((t) => isDarkChartTheme(t));
/** The colours a custom chart theme sets (the Style tab edits them); the rest come from the classic theme. */
export const CUSTOM_THEME_KEYS = ['bg', 'text', 'muted', 'grid', 'axis', 'palette', 'font'];
const HEX = /^#[0-9a-f]{6}$/i;
/** The custom chart theme of a chart's options (options.customTheme), complete. */
export function customChartTheme(custom = {}) {
  const base = CHART_THEMES[0];
  const pick = (key) => (key === 'palette' ? (PALETTES.some((p) => p.id === custom.palette) ? custom.palette : base.palette) : key === 'font' ? String(custom.font ?? '') : HEX.test(String(custom[key] ?? '')) ? custom[key] : base[key]);
  const theme = { id: 'custom', ko: '사용자 설정', en: 'Custom', ...Object.fromEntries(CUSTOM_THEME_KEYS.map((key) => [key, pick(key)])) };
  if (!theme.font) delete theme.font;
  return theme;
}
/** A theme colour as #rrggbb for a colour box: rgba() is blended over the paper it is drawn on. */
export function colorBoxValue(color, paper = '#ffffff') {
  const value = String(color ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split('').map((ch) => ch + ch).join('')}`.toLowerCase();
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
  if (!m) return '#000000';
  const a = m[4] == null ? 1 : Number(m[4]);
  const p = /^#([0-9a-f]{6})$/i.exec(paper)?.[1] ?? 'ffffff';
  const under = [0, 2, 4].map((i) => parseInt(p.slice(i, i + 2), 16));
  return `#${[1, 2, 3].map((k, i) => Math.round(Number(m[k]) * a + under[i] * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
}

/** A chart theme by id; 'custom' is the chart's own (options.customTheme). */
export const chartTheme = (id, options = null) => (id === 'custom' ? customChartTheme(options?.customTheme) : CHART_THEMES.find((t) => t.id === id) ?? CHART_THEMES[0]);
