// Theme palettes.
//
// `light` and `dark` are the literal ports of App/ModernTheme.cs from
// DBToolsWinV10 and are kept value-for-value. The other 14 themes are built
// from a compact seed by `buildPalette`, which derives the ~45 surface colours
// the UI and the canvas renderer need.
import type { DbTargetType } from '../types';

export type ThemeId =
  | 'light'
  | 'paper'
  | 'solarized-light'
  | 'nord-light'
  | 'rose'
  | 'forest'
  | 'ocean'
  | 'contrast-light'
  | 'dark'
  | 'midnight'
  | 'solarized-dark'
  | 'nord'
  | 'dracula'
  | 'one-dark'
  | 'gruvbox'
  | 'contrast-dark';

export type ThemeKind = 'light' | 'dark';

/** Retained for readability at call sites that only care about light vs dark. */
export type ThemeMode = ThemeKind;

export interface Palette {
  appBackground: string;
  panelBackground: string;
  sidebarBackground: string;
  listRowAlternate: string;
  inputBackground: string;
  canvasBackground: string;
  canvasChrome: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  /** Readable text/icon colour on top of `accent`. */
  accentContrast: string;
  border: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gridLine: string;
  scrollBarTrack: string;
  scrollBarThumb: string;
  toolIdle: string;
  toolHover: string;
  toolSelected: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  canvasRowEven: string;
  canvasRowOdd: string;
  canvasBorder: string;
  canvasBorderLight: string;
  canvasShadow: string;
  canvasTextPrimary: string;
  canvasTextSecondary: string;
  canvasPkText: string;
  canvasFkText: string;
  canvasHighlightRow: string;
  canvasRelLine: string;
  canvasRelText: string;
  canvasRelNameBg: string;
  canvasGridMinor: string;
  canvasGridMajor: string;
  rulerBackground: string;
  rulerTick: string;
  rulerMajorTick: string;
  rulerText: string;
  rulerBorder: string;
}

// ─── Colour helpers ────────────────────────────────────────────────────────

type Rgb = [number, number, number];

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;
const rgba = (a: number, r: number, g: number, b: number) =>
  `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;

function hex(value: string): Rgb {
  const v = value.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

const toCss = (c: Rgb) => rgb(Math.round(c[0]), Math.round(c[1]), Math.round(c[2]));

/** Linear blend: amount 0 returns `a`, 1 returns `b`. */
function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

/** Pick black or white text for legibility on `c` (WCAG relative luminance). */
function readableOn(c: Rgb): string {
  const channel = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  return luminance > 0.45 ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)';
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

const alpha = (c: Rgb, a: number) =>
  `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a.toFixed(3)})`;

// ─── Seed → full palette ───────────────────────────────────────────────────

interface ThemeSeed {
  kind: ThemeKind;
  app: string;
  panel: string;
  sidebar: string;
  canvas: string;
  border: string;
  text: string;
  textSecondary: string;
  accent: string;
  /** Primary-key label colour on the diagram (amber family by convention). */
  pk: string;
  /** Foreign-key label colour on the diagram (blue/cyan family). */
  fk: string;
  /** Row highlight for the selected / flagged column. */
  highlight: string;
  success?: string;
  warning?: string;
  danger?: string;
  info?: string;
}

function buildPalette(seed: ThemeSeed): Palette {
  const isDark = seed.kind === 'dark';
  const app = hex(seed.app);
  const panel = hex(seed.panel);
  const sidebar = hex(seed.sidebar);
  const canvas = hex(seed.canvas);
  const border = hex(seed.border);
  const text = hex(seed.text);
  const textSecondary = hex(seed.textSecondary);
  const accent = hex(seed.accent);
  const toward = isDark ? WHITE : BLACK;
  const away = isDark ? BLACK : WHITE;

  return {
    appBackground: toCss(app),
    panelBackground: toCss(panel),
    sidebarBackground: toCss(sidebar),
    listRowAlternate: toCss(mix(panel, app, 0.5)),
    inputBackground: toCss(isDark ? mix(panel, WHITE, 0.06) : panel),
    canvasBackground: toCss(canvas),
    canvasChrome: toCss(mix(border, panel, 0.4)),

    accent: toCss(accent),
    accentHover: toCss(mix(accent, toward, 0.22)),
    accentMuted: toCss(mix(accent, app, isDark ? 0.7 : 0.82)),
    accentContrast: readableOn(accent),

    border: toCss(border),
    borderLight: toCss(mix(border, panel, 0.55)),

    textPrimary: toCss(text),
    textSecondary: toCss(textSecondary),
    textMuted: toCss(mix(textSecondary, panel, 0.42)),
    gridLine: toCss(mix(border, panel, 0.25)),

    scrollBarTrack: toCss(mix(app, panel, 0.5)),
    scrollBarThumb: toCss(mix(border, text, 0.28)),

    toolIdle: toCss(sidebar),
    toolHover: toCss(mix(panel, toward, 0.07)),
    toolSelected: toCss(mix(accent, app, isDark ? 0.7 : 0.82)),

    // Normalised to rgb() like every other key: seeds are written as hex, and a
    // palette that mixed the two notations would break anything that compares
    // or parses these values.
    success: seed.success ? toCss(hex(seed.success)) : rgb(16, 185, 129),
    warning: seed.warning ? toCss(hex(seed.warning)) : rgb(245, 158, 11),
    danger: seed.danger ? toCss(hex(seed.danger)) : rgb(239, 68, 68),
    info: seed.info ? toCss(hex(seed.info)) : rgb(99, 102, 241),

    canvasRowEven: toCss(mix(canvas, toward, 0.04)),
    canvasRowOdd: toCss(canvas),
    canvasBorder: toCss(mix(border, text, 0.18)),
    canvasBorderLight: toCss(mix(border, canvas, 0.5)),
    canvasShadow: alpha(BLACK, isDark ? 0.28 : 0.12),
    canvasTextPrimary: toCss(mix(text, canvas, 0.06)),
    canvasTextSecondary: toCss(textSecondary),
    canvasPkText: toCss(hex(seed.pk)),
    canvasFkText: toCss(hex(seed.fk)),
    canvasHighlightRow: toCss(hex(seed.highlight)),
    canvasRelLine: toCss(mix(textSecondary, canvas, 0.22)),
    canvasRelText: toCss(textSecondary),
    canvasRelNameBg: alpha(canvas, 0.86),
    // Slightly stronger than ModernTheme's values so the grid toolbar toggle
    // has a visible effect; the ported values were almost imperceptible.
    canvasGridMinor: alpha(toward, isDark ? 0.09 : 0.07),
    canvasGridMajor: alpha(toward, isDark ? 0.17 : 0.14),

    rulerBackground: toCss(panel),
    rulerTick: toCss(mix(border, away, 0.2)),
    rulerMajorTick: toCss(mix(textSecondary, canvas, 0.15)),
    rulerText: toCss(textSecondary),
    rulerBorder: toCss(border),
  };
}

// ─── The two ported palettes (App/ModernTheme.cs, value-for-value) ─────────

const LIGHT: Palette = {
  appBackground: rgb(240, 242, 245),
  panelBackground: rgb(255, 255, 255),
  sidebarBackground: rgb(250, 251, 253),
  listRowAlternate: rgb(248, 249, 252),
  inputBackground: rgb(255, 255, 255),
  canvasBackground: rgb(255, 255, 255),
  canvasChrome: rgb(226, 232, 240),
  accent: rgb(37, 99, 235),
  accentHover: rgb(29, 78, 216),
  accentMuted: rgb(219, 234, 254),
  accentContrast: rgb(255, 255, 255),
  border: rgb(209, 213, 219),
  borderLight: rgb(229, 231, 235),
  textPrimary: rgb(17, 24, 39),
  textSecondary: rgb(107, 114, 128),
  textMuted: rgb(156, 163, 175),
  gridLine: rgb(218, 220, 224),
  scrollBarTrack: rgb(241, 241, 241),
  scrollBarThumb: rgb(180, 180, 180),
  toolIdle: rgb(250, 251, 253),
  toolHover: rgb(243, 244, 246),
  toolSelected: rgb(219, 234, 254),
  success: rgb(16, 185, 129),
  warning: rgb(245, 158, 11),
  danger: rgb(239, 68, 68),
  info: rgb(99, 102, 241),
  canvasRowEven: rgb(248, 249, 250),
  canvasRowOdd: rgb(255, 255, 255),
  canvasBorder: rgb(180, 180, 190),
  canvasBorderLight: rgb(220, 220, 226),
  canvasShadow: rgba(30, 0, 0, 0),
  canvasTextPrimary: rgb(40, 40, 40),
  canvasTextSecondary: rgb(110, 110, 120),
  canvasPkText: rgb(180, 100, 0),
  canvasFkText: rgb(0, 100, 160),
  canvasHighlightRow: rgb(255, 243, 205),
  canvasRelLine: rgb(100, 100, 120),
  canvasRelText: rgb(80, 80, 100),
  canvasRelNameBg: rgba(200, 242, 242, 248),
  // Raised from ModernTheme's 10/22 so the grid toolbar toggle is visible.
  canvasGridMinor: rgba(18, 0, 0, 0),
  canvasGridMajor: rgba(36, 0, 0, 0),
  rulerBackground: rgb(248, 249, 251),
  rulerTick: rgb(180, 186, 195),
  rulerMajorTick: rgb(107, 114, 128),
  rulerText: rgb(75, 85, 99),
  rulerBorder: rgb(209, 213, 219),
};

const DARK: Palette = {
  appBackground: rgb(18, 18, 24),
  panelBackground: rgb(28, 28, 40),
  sidebarBackground: rgb(22, 22, 32),
  listRowAlternate: rgb(32, 32, 46),
  inputBackground: rgb(36, 38, 50),
  canvasBackground: rgb(20, 20, 30),
  canvasChrome: rgb(36, 36, 52),
  accent: rgb(96, 165, 250),
  accentHover: rgb(147, 197, 253),
  accentMuted: rgb(30, 58, 138),
  accentContrast: rgb(17, 24, 39),
  border: rgb(55, 55, 84),
  borderLight: rgb(42, 42, 68),
  textPrimary: rgb(229, 231, 235),
  textSecondary: rgb(156, 163, 175),
  textMuted: rgb(100, 107, 115),
  gridLine: rgb(58, 62, 88),
  scrollBarTrack: rgb(36, 36, 52),
  scrollBarThumb: rgb(78, 78, 104),
  toolIdle: rgb(28, 28, 40),
  toolHover: rgb(42, 42, 68),
  toolSelected: rgb(30, 58, 138),
  success: rgb(16, 185, 129),
  warning: rgb(245, 158, 11),
  danger: rgb(239, 68, 68),
  info: rgb(99, 102, 241),
  canvasRowEven: rgb(35, 35, 52),
  canvasRowOdd: rgb(28, 28, 44),
  canvasBorder: rgb(65, 65, 95),
  canvasBorderLight: rgb(48, 48, 72),
  canvasShadow: rgba(70, 0, 0, 0),
  canvasTextPrimary: rgb(205, 210, 220),
  canvasTextSecondary: rgb(130, 138, 155),
  canvasPkText: rgb(220, 130, 30),
  canvasFkText: rgb(55, 148, 215),
  canvasHighlightRow: rgb(72, 54, 10),
  canvasRelLine: rgb(120, 128, 165),
  canvasRelText: rgb(148, 148, 178),
  canvasRelNameBg: rgba(210, 38, 38, 58),
  // Raised from ModernTheme's 15/28 so the grid toolbar toggle is visible.
  canvasGridMinor: rgba(24, 255, 255, 255),
  canvasGridMajor: rgba(44, 255, 255, 255),
  rulerBackground: rgb(28, 28, 40),
  rulerTick: rgb(88, 92, 112),
  rulerMajorTick: rgb(128, 134, 158),
  rulerText: rgb(138, 146, 168),
  rulerBorder: rgb(55, 55, 84),
};

// ─── Theme catalogue ───────────────────────────────────────────────────────

export interface ThemeDefinition {
  id: ThemeId;
  kind: ThemeKind;
  nameKo: string;
  nameEn: string;
  palette: Palette;
}

const SEEDS: Record<Exclude<ThemeId, 'light' | 'dark'>, ThemeSeed> = {
  paper: {
    kind: 'light',
    app: '#efe9dd', panel: '#fbf7ef', sidebar: '#f5efe3', canvas: '#fffdf7',
    border: '#d6cbb5', text: '#3b352a', textSecondary: '#7a6f5c',
    accent: '#9a6b3f', pk: '#a5661a', fk: '#2f6f8f', highlight: '#f6e6b8',
  },
  'solarized-light': {
    kind: 'light',
    app: '#eee8d5', panel: '#fdf6e3', sidebar: '#f5efdc', canvas: '#fdf6e3',
    border: '#d5cdb6', text: '#586e75', textSecondary: '#839496',
    accent: '#268bd2', pk: '#b58900', fk: '#2aa198', highlight: '#f0e4be',
    success: '#859900', warning: '#b58900', danger: '#dc322f', info: '#6c71c4',
  },
  'nord-light': {
    kind: 'light',
    app: '#d8dee9', panel: '#eceff4', sidebar: '#e5e9f0', canvas: '#f7f9fc',
    border: '#c2cad8', text: '#2e3440', textSecondary: '#4c566a',
    accent: '#5e81ac', pk: '#bf8040', fk: '#3b7f8c', highlight: '#eadfba',
    success: '#a3be8c', warning: '#d08770', danger: '#bf616a', info: '#b48ead',
  },
  rose: {
    kind: 'light',
    app: '#f3e8ee', panel: '#fdf7fa', sidebar: '#f8eef4', canvas: '#fffafc',
    border: '#e0c8d5', text: '#3d2b35', textSecondary: '#7d5f6e',
    accent: '#b5487a', pk: '#b06a12', fk: '#6d4aa8', highlight: '#f7dce8',
  },
  forest: {
    kind: 'light',
    app: '#e6ede4', panel: '#f7faf5', sidebar: '#eef3ec', canvas: '#fcfdfb',
    border: '#c5d3c0', text: '#24301f', textSecondary: '#56684f',
    accent: '#2f7d32', pk: '#a1620a', fk: '#1f6f8b', highlight: '#e4edb9',
  },
  ocean: {
    kind: 'light',
    app: '#e2eef2', panel: '#f6fbfd', sidebar: '#ecf5f8', canvas: '#fbfeff',
    border: '#bcd4dd', text: '#123038', textSecondary: '#4a6f7a',
    accent: '#0e7490', pk: '#b45309', fk: '#1d4ed8', highlight: '#cdeaf2',
  },
  'contrast-light': {
    kind: 'light',
    app: '#ffffff', panel: '#ffffff', sidebar: '#f0f0f0', canvas: '#ffffff',
    border: '#000000', text: '#000000', textSecondary: '#2b2b2b',
    accent: '#0000cc', pk: '#8a4b00', fk: '#0000cc', highlight: '#ffff8d',
    success: '#006400', warning: '#8a4b00', danger: '#b00000', info: '#0000cc',
  },
  midnight: {
    kind: 'dark',
    app: '#0b1020', panel: '#121a2e', sidebar: '#0e1526', canvas: '#0a0f1d',
    border: '#26324d', text: '#dbe4f5', textSecondary: '#8fa3c8',
    accent: '#5b9cff', pk: '#e0a33e', fk: '#58b4ff', highlight: '#3c3514',
  },
  'solarized-dark': {
    kind: 'dark',
    app: '#002b36', panel: '#073642', sidebar: '#04313d', canvas: '#002b36',
    border: '#1e4d59', text: '#93a1a1', textSecondary: '#7d9294',
    accent: '#268bd2', pk: '#b58900', fk: '#2aa198', highlight: '#124d55',
    success: '#859900', warning: '#b58900', danger: '#dc322f', info: '#6c71c4',
  },
  nord: {
    kind: 'dark',
    app: '#2e3440', panel: '#3b4252', sidebar: '#333b4a', canvas: '#2b303b',
    border: '#4c566a', text: '#e5e9f0', textSecondary: '#a9b3c6',
    accent: '#88c0d0', pk: '#ebcb8b', fk: '#81a1c1', highlight: '#4c4632',
    success: '#a3be8c', warning: '#d08770', danger: '#bf616a', info: '#b48ead',
  },
  dracula: {
    kind: 'dark',
    app: '#21222c', panel: '#282a36', sidebar: '#242530', canvas: '#282a36',
    border: '#44475a', text: '#f8f8f2', textSecondary: '#9aa3c7',
    accent: '#bd93f9', pk: '#ffb86c', fk: '#8be9fd', highlight: '#4a4520',
    success: '#50fa7b', warning: '#ffb86c', danger: '#ff5555', info: '#bd93f9',
  },
  'one-dark': {
    kind: 'dark',
    app: '#21252b', panel: '#282c34', sidebar: '#23272e', canvas: '#282c34',
    border: '#3e4451', text: '#c8cdd6', textSecondary: '#8b92a0',
    accent: '#61afef', pk: '#e5c07b', fk: '#56b6c2', highlight: '#45402a',
    success: '#98c379', warning: '#e5c07b', danger: '#e06c75', info: '#c678dd',
  },
  gruvbox: {
    kind: 'dark',
    app: '#1d2021', panel: '#282828', sidebar: '#232323', canvas: '#282828',
    border: '#504945', text: '#ebdbb2', textSecondary: '#a89984',
    accent: '#83a598', pk: '#fabd2f', fk: '#8ec07c', highlight: '#4d3f1f',
    success: '#b8bb26', warning: '#fabd2f', danger: '#fb4934', info: '#d3869b',
  },
  'contrast-dark': {
    kind: 'dark',
    app: '#000000', panel: '#000000', sidebar: '#0d0d0d', canvas: '#000000',
    border: '#ffffff', text: '#ffffff', textSecondary: '#d4d4d4',
    accent: '#4fc3f7', pk: '#ffd54f', fk: '#80d8ff', highlight: '#4a4a00',
    success: '#69f0ae', warning: '#ffd54f', danger: '#ff8a80', info: '#82b1ff',
  },
};

export const THEMES: ThemeDefinition[] = [
  { id: 'light', kind: 'light', nameKo: '라이트', nameEn: 'Light', palette: LIGHT },
  { id: 'paper', kind: 'light', nameKo: '페이퍼', nameEn: 'Paper', palette: buildPalette(SEEDS.paper) },
  { id: 'solarized-light', kind: 'light', nameKo: '솔라라이즈드 라이트', nameEn: 'Solarized Light', palette: buildPalette(SEEDS['solarized-light']) },
  { id: 'nord-light', kind: 'light', nameKo: '노르드 라이트', nameEn: 'Nord Light', palette: buildPalette(SEEDS['nord-light']) },
  { id: 'rose', kind: 'light', nameKo: '로즈', nameEn: 'Rose', palette: buildPalette(SEEDS.rose) },
  { id: 'forest', kind: 'light', nameKo: '포레스트', nameEn: 'Forest', palette: buildPalette(SEEDS.forest) },
  { id: 'ocean', kind: 'light', nameKo: '오션', nameEn: 'Ocean', palette: buildPalette(SEEDS.ocean) },
  { id: 'contrast-light', kind: 'light', nameKo: '고대비 라이트', nameEn: 'High Contrast Light', palette: buildPalette(SEEDS['contrast-light']) },
  { id: 'dark', kind: 'dark', nameKo: '다크', nameEn: 'Dark', palette: DARK },
  { id: 'midnight', kind: 'dark', nameKo: '미드나이트', nameEn: 'Midnight', palette: buildPalette(SEEDS.midnight) },
  { id: 'solarized-dark', kind: 'dark', nameKo: '솔라라이즈드 다크', nameEn: 'Solarized Dark', palette: buildPalette(SEEDS['solarized-dark']) },
  { id: 'nord', kind: 'dark', nameKo: '노르드', nameEn: 'Nord', palette: buildPalette(SEEDS.nord) },
  { id: 'dracula', kind: 'dark', nameKo: '드라큘라', nameEn: 'Dracula', palette: buildPalette(SEEDS.dracula) },
  { id: 'one-dark', kind: 'dark', nameKo: '원 다크', nameEn: 'One Dark', palette: buildPalette(SEEDS['one-dark']) },
  { id: 'gruvbox', kind: 'dark', nameKo: '그루브박스', nameEn: 'Gruvbox', palette: buildPalette(SEEDS.gruvbox) },
  { id: 'contrast-dark', kind: 'dark', nameKo: '고대비 다크', nameEn: 'High Contrast Dark', palette: buildPalette(SEEDS['contrast-dark']) },
];

const THEME_BY_ID = new Map<string, ThemeDefinition>(THEMES.map((t) => [t.id, t]));

export const DEFAULT_THEME_ID: ThemeId = 'light';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_BY_ID.has(value);
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEME_BY_ID.get(id) ?? THEME_BY_ID.get(DEFAULT_THEME_ID)!;
}

export function getPalette(id: ThemeId): Palette {
  return getTheme(id).palette;
}

export function isDarkTheme(id: ThemeId): boolean {
  return getTheme(id).kind === 'dark';
}

export function getThemeName(id: ThemeId, language: 'ko' | 'en'): string {
  const theme = getTheme(id);
  return language === 'en' ? theme.nameEn : theme.nameKo;
}

/** Header colours per target DB — port of DiagramCanvas.GetHeaderColor. */
export function getHeaderColor(db: DbTargetType): string {
  switch (db) {
    case 'PostgreSQL':
      return rgb(52, 101, 164);
    case 'MySQL':
      return rgb(0, 114, 66);
    case 'MariaDB':
      return rgb(194, 63, 63);
    case 'SQLite':
      return rgb(90, 90, 140);
    case 'SqlServer':
      return rgb(152, 34, 34);
    case 'VectorDb':
      return rgb(88, 64, 168);
    default:
      return rgb(90, 90, 140);
  }
}

/** Push the palette into CSS custom properties on :root. */
export function applyPaletteToDocument(id: ThemeId): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.palette)) {
    root.style.setProperty(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
  }
  root.dataset.theme = theme.id;
  root.dataset.themeKind = theme.kind;
  root.style.colorScheme = theme.kind;
}
