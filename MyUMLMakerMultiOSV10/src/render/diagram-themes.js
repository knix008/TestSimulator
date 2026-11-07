// The colour schemes of the diagrams: by default the program's theme (FOLLOW_THEME), or one of 40,
// 20 light and 20 dark (Settings › Drawing, View › Colour scheme). A scheme gives the paper, the shapes' fill, line and text; "fills" colours each family
// of shapes on its own. Every scheme keeps its text readable on its fills (test/unit/render.test.js).
import { appDiagramPalette, hslToHex } from '../themes.js';

/** The families of shapes that can have a colour of their own, with where each sits on the colour wheel. */
const FAMILIES = { classifier: 0, instance: 150, behavior: 260, state: 110, activity: 90, interaction: 200, erd: 30, flowchart: 210, dfd: 350, sysml: 280, package: 60, annotation: 50 };

const families = (hue, saturation, lightness) => Object.fromEntries(Object.entries(FAMILIES).map(([name, turn]) => [name, hslToHex((hue + turn) % 360, saturation, lightness)]));

/** A light scheme: tinted paper and shapes, a dark line of the same hue; `many`: each family its own colour. */
function light(hue, saturation, { paper = 99, shape = 95, many = false } = {}) {
  return {
    dark: false,
    background: hslToHex(hue, saturation * 0.5, paper),
    fill: hslToHex(hue, saturation, shape),
    line: hslToHex(hue, Math.min(60, saturation), 26),
    color: hslToHex(hue, 35, 12),
    grid: hslToHex(hue, saturation * 0.4, 92),
    gridMajor: hslToHex(hue, saturation * 0.35, 72),
    ...(many ? { fills: families(hue, saturation, shape - 3) } : {}),
  };
}

/** A dark scheme: deep paper, slightly lighter shapes, a bright line of the same hue. */
function dark(hue, saturation, { paper = 12, shape = 18, many = false } = {}) {
  return {
    dark: true,
    background: hslToHex(hue, saturation, paper),
    fill: hslToHex(hue, saturation, shape),
    line: hslToHex(hue, Math.min(70, saturation + 25), 78),
    color: hslToHex(hue, 20, 94),
    grid: hslToHex(hue, saturation, paper + 6),
    gridMajor: hslToHex(hue, saturation, paper + 24),
    ...(many ? { fills: families(hue, saturation, shape + 2) } : {}),
  };
}

const CLASSIC = { dark: false, background: '#ffffff', fill: '#ffffff', line: '#1f1f1f', color: '#000000', grid: '#e9ecf1', gridMajor: '#a9b2bf' };
const PASTEL = { dark: false, background: '#ffffff', fill: '#fffdf2', line: '#4a4a4a', color: '#1f2937', grid: '#eceff3', gridMajor: '#b3bac5', fills: { classifier: '#fff7d6', instance: '#e8f4ff', behavior: '#f1ecff', state: '#eaf7ee', activity: '#eaf7ee', interaction: '#f0f6ff', erd: '#fff1e6', flowchart: '#eef6ff', dfd: '#fef2f2', sysml: '#f3f0ff', package: '#f5f5f4', annotation: '#fffbe6' } };
const BLUEPRINT = { dark: true, background: '#0f3057', fill: '#14406f', line: '#cfe3ff', color: '#ffffff', grid: '#1a4675', gridMajor: '#4f8cca' };
const DARK = { dark: true, background: '#1e1f24', fill: '#2a2c33', line: '#c9ccd4', color: '#e8eaef', grid: '#2a2c33', gridMajor: '#535867' };

/** id → [Korean name, English name, scheme]. */
const LIST = {
  classic: ['클래식 (흰색)', 'Classic (white)', CLASSIC],
  pastel: ['파스텔', 'Pastel', PASTEL],
  paper: ['종이', 'Paper', light(42, 45, { paper: 98, shape: 94 })],
  sky: ['하늘', 'Sky', light(205, 80)],
  ocean: ['바다', 'Ocean', light(195, 70, { shape: 92 })],
  mint: ['민트', 'Mint', light(160, 60)],
  forest: ['숲', 'Forest', light(130, 40, { shape: 93 })],
  lime: ['라임', 'Lime', light(85, 65)],
  lemon: ['레몬', 'Lemon', light(52, 90)],
  apricot: ['살구', 'Apricot', light(30, 85)],
  coral: ['산호', 'Coral', light(10, 80)],
  rose: ['장미', 'Rose', light(345, 75)],
  lavender: ['라벤더', 'Lavender', light(260, 65)],
  lilac: ['라일락', 'Lilac', light(290, 55)],
  slate: ['슬레이트', 'Slate', light(215, 22, { shape: 94 })],
  stone: ['돌', 'Stone', light(30, 10, { shape: 93 })],
  rainbow: ['무지개', 'Rainbow', light(0, 75, { many: true })],
  spring: ['봄', 'Spring', light(110, 60, { many: true })],
  sunset: ['노을', 'Sunset', light(25, 80, { many: true })],
  print: ['인쇄용 회색', 'Print Grey', { dark: false, background: '#ffffff', fill: '#f2f2f2', line: '#333333', color: '#111111', grid: '#eeeeee', gridMajor: '#bbbbbb' }],
  blueprint: ['청사진', 'Blueprint', BLUEPRINT],
  dark: ['어두운', 'Dark', DARK],
  midnight: ['한밤', 'Midnight', dark(230, 45)],
  navy: ['남색', 'Navy', dark(215, 60, { paper: 14, shape: 21 })],
  deepSea: ['깊은 바다', 'Deep Sea', dark(195, 60)],
  teal: ['청록', 'Teal', dark(175, 50)],
  pine: ['소나무', 'Pine', dark(150, 40)],
  moss: ['이끼', 'Moss', dark(95, 30)],
  olive: ['올리브', 'Olive', dark(65, 30)],
  bronze: ['청동', 'Bronze', dark(38, 35)],
  ember: ['잉걸불', 'Ember', dark(18, 45)],
  wine: ['와인', 'Wine', dark(345, 40)],
  plum: ['자두', 'Plum', dark(300, 30)],
  violet: ['보라', 'Violet', dark(265, 40)],
  graphite: ['흑연', 'Graphite', dark(220, 8)],
  charcoal: ['숯', 'Charcoal', dark(30, 6)],
  ink: ['먹', 'Ink', dark(0, 0, { paper: 7, shape: 13 })],
  neon: ['네온', 'Neon', dark(280, 50, { paper: 8, many: true })],
  aurora: ['오로라', 'Aurora', dark(170, 45, { paper: 9, many: true })],
  chalkboard: ['칠판', 'Chalkboard', dark(150, 25, { paper: 16, shape: 21 })],
};

export const DIAGRAM_THEME_LIST = Object.entries(LIST).map(([id, [ko, en, scheme]]) => ({ id, ko, en, ...scheme }));
export const DIAGRAM_THEMES = Object.fromEntries(DIAGRAM_THEME_LIST.map(({ id, ko: _ko, en: _en, ...scheme }) => [id, scheme]));
/** The default: the diagrams wear the program's theme. Not one of the 40: it has no colours of its own. */
export const FOLLOW_THEME = 'theme';
Object.defineProperty(DIAGRAM_THEMES, FOLLOW_THEME, { get: appDiagramPalette, enumerable: false });
