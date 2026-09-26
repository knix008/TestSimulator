'use strict';

// 박스 테마. 색 조합마다 이름을 붙여 두고 메뉴에서 고른다.
// bg 는 박스 바탕, bar 는 제목 줄, text 는 글씨 색이다.
// 값을 바꾸면 tools/make-icons.js 를 다시 돌려 테마 그림도 새로 만든다.

// 색이 도는 차례로 늘어놓는다. 파랑에서 풀빛, 노랑, 붉은빛, 보랏빛을 지나
// 무채색으로 끝난다. 설정 창은 한 줄에 열 개씩 보여 주므로 세 줄이 된다.
const THEMES = [
  { id: 'ocean', label: { ko: '바다', en: 'Ocean' }, bg: '#2563eb', bar: '#1e3a8a', text: '#ffffff' },
  { id: 'cobalt', label: { ko: '코발트', en: 'Cobalt' }, bg: '#1d4ed8', bar: '#172554', text: '#ffffff' },
  { id: 'indigo', label: { ko: '남보라', en: 'Indigo' }, bg: '#4f46e5', bar: '#312e81', text: '#ffffff' },
  { id: 'sky', label: { ko: '하늘', en: 'Sky' }, bg: '#0ea5e9', bar: '#075985', text: '#ffffff' },
  { id: 'lagoon', label: { ko: '석호', en: 'Lagoon' }, bg: '#06b6d4', bar: '#155e75', text: '#ffffff' },
  { id: 'teal', label: { ko: '청록', en: 'Teal' }, bg: '#0f766e', bar: '#134e4a', text: '#ffffff' },
  { id: 'mint', label: { ko: '민트', en: 'Mint' }, bg: '#10b981', bar: '#065f46', text: '#ffffff' },
  { id: 'pine', label: { ko: '솔', en: 'Pine' }, bg: '#064e3b', bar: '#022c22', text: '#ffffff' },
  { id: 'forest', label: { ko: '숲', en: 'Forest' }, bg: '#16a34a', bar: '#14532d', text: '#ffffff' },
  { id: 'olive', label: { ko: '올리브', en: 'Olive' }, bg: '#65a30d', bar: '#3f6212', text: '#ffffff' },
  { id: 'lime', label: { ko: '라임', en: 'Lime' }, bg: '#84cc16', bar: '#4d7c0f', text: '#0f172a' },
  { id: 'lemon', label: { ko: '레몬', en: 'Lemon' }, bg: '#facc15', bar: '#a16207', text: '#0f172a' },
  { id: 'gold', label: { ko: '황금', en: 'Gold' }, bg: '#ca8a04', bar: '#713f12', text: '#ffffff' },
  { id: 'amber', label: { ko: '호박', en: 'Amber' }, bg: '#d97706', bar: '#78350f', text: '#ffffff' },
  { id: 'peach', label: { ko: '복숭아', en: 'Peach' }, bg: '#fb923c', bar: '#9a3412', text: '#0f172a' },
  { id: 'sunset', label: { ko: '노을', en: 'Sunset' }, bg: '#ea580c', bar: '#7c2d12', text: '#ffffff' },
  { id: 'cherry', label: { ko: '체리', en: 'Cherry' }, bg: '#dc2626', bar: '#7f1d1d', text: '#ffffff' },
  { id: 'coral', label: { ko: '산호', en: 'Coral' }, bg: '#f43f5e', bar: '#9f1239', text: '#ffffff' },
  { id: 'rose', label: { ko: '장미', en: 'Rose' }, bg: '#be123c', bar: '#881337', text: '#ffffff' },
  { id: 'wine', label: { ko: '포도주', en: 'Wine' }, bg: '#831843', bar: '#4c0519', text: '#ffffff' },
  { id: 'plum', label: { ko: '자두', en: 'Plum' }, bg: '#a21caf', bar: '#701a75', text: '#ffffff' },
  { id: 'lilac', label: { ko: '라일락', en: 'Lilac' }, bg: '#c4b5fd', bar: '#7c3aed', text: '#0f172a' },
  { id: 'violet', label: { ko: '보라', en: 'Violet' }, bg: '#7c3aed', bar: '#4c1d95', text: '#ffffff' },
  { id: 'steel', label: { ko: '강철', en: 'Steel' }, bg: '#475569', bar: '#1e293b', text: '#ffffff' },
  { id: 'graphite', label: { ko: '흑연', en: 'Graphite' }, bg: '#334155', bar: '#0f172a', text: '#ffffff' },
  { id: 'stone', label: { ko: '자갈', en: 'Stone' }, bg: '#57534e', bar: '#292524', text: '#ffffff' },
  { id: 'mocha', label: { ko: '모카', en: 'Mocha' }, bg: '#92400e', bar: '#451a03', text: '#ffffff' },
  { id: 'sand', label: { ko: '모래', en: 'Sand' }, bg: '#e7e5e4', bar: '#a8a29e', text: '#0f172a' },
  { id: 'mist', label: { ko: '안개', en: 'Mist' }, bg: '#cbd5e1', bar: '#64748b', text: '#0f172a' },
  { id: 'night', label: { ko: '밤', en: 'Night' }, bg: '#1e293b', bar: '#020617', text: '#e2e8f0' },
];

// 박스 모서리. 각진 것부터 둥근 것까지 고를 수 있다.
const CORNERS = [
  { id: 'square', label: { ko: '각지게', en: 'Square' }, radius: 0 },
  { id: 'soft', label: { ko: '조금 둥글게', en: 'Soft' }, radius: 9 },
  { id: 'round', label: { ko: '둥글게', en: 'Round' }, radius: 20 },
];
const DEFAULT_CORNER = 20;
const MIN_CORNER = 0;
const MAX_CORNER = 28;

// 모서리는 픽셀 수로 저장한다. 예전 저장본은 이름으로 적혀 있어 숫자로 옮긴다.
function cornerRadius(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(MIN_CORNER, Math.min(MAX_CORNER, Math.round(value)));
  }
  const preset = CORNERS.find((corner) => corner.id === value);
  return preset ? preset.radius : DEFAULT_CORNER;
}

// 지금 값에 가장 가까운 이름. 메뉴 그림을 고를 때 쓴다.
function cornerName(value) {
  const radius = cornerRadius(value);
  return CORNERS.reduce(
    (best, corner) => (Math.abs(corner.radius - radius) < Math.abs(best.radius - radius) ? corner : best),
    CORNERS[0]
  ).id;
}

const DEFAULT_THEME = 'ocean';
const OPACITIES = [0.24, 0.38, 0.52, 0.66, 0.80];
const DEFAULT_OPACITY = 0.52;

const byId = new Map(THEMES.map((theme) => [theme.id, theme]));

function themeOf(id) {
  return byId.get(id) || byId.get(DEFAULT_THEME);
}

// 예전 저장본은 테마 대신 색 하나만 갖고 있다. 가장 가까운 테마로 옮긴다.
function themeForColor(hex) {
  const value = String(hex || '').toLowerCase();
  const exact = THEMES.find((theme) => theme.bg.toLowerCase() === value);
  if (exact) return exact.id;
  const target = parseHex(value);
  if (!target) return DEFAULT_THEME;
  let best = DEFAULT_THEME;
  let bestGap = Infinity;
  for (const theme of THEMES) {
    const rgb = parseHex(theme.bg);
    const gap = (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (gap < bestGap) {
      bestGap = gap;
      best = theme.id;
    }
  }
  return best;
}

function parseHex(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// 밝기. 글씨를 희게 둘지 검게 둘지 정할 때 쓴다.
function brightness(hex) {
  const rgb = parseHex(hex) || [0, 0, 0];
  return (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
}

function toHex(rgb) {
  return `#${rgb.map((v) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function darken(hex, keep) {
  const rgb = parseHex(hex) || [37, 99, 235];
  return toHex(rgb.map((v) => v * keep));
}

function autoText(bg) {
  return brightness(bg) > 0.62 ? '#0f172a' : '#ffffff';
}

// 직접 고른 색도 테마처럼 다룬다.
function customTheme(custom) {
  const bg = parseHex(custom && custom.bg) ? custom.bg : THEMES[0].bg;
  const bar = parseHex(custom && custom.bar) ? custom.bar : darken(bg, 0.55);
  return { id: 'custom', label: { ko: '직접 고른 색', en: 'Custom' }, bg, bar, text: autoText(bg) };
}

// 박스가 실제로 쓸 색. 직접 고른 색이 있으면 그것이 우선이다.
function resolve(fence) {
  if (fence && fence.theme === 'custom' && fence.custom) return customTheme(fence.custom);
  return themeOf(fence && fence.theme);
}

// 메뉴에 보여 줄 이름. 테마 이름은 언어마다 다르다.
function themeLabel(theme, lang) {
  return theme.label[lang] || theme.label.ko;
}

module.exports = {
  THEMES,
  CORNERS,
  DEFAULT_CORNER,
  MIN_CORNER,
  MAX_CORNER,
  cornerRadius,
  cornerName,
  brightness,
  darken,
  autoText,
  customTheme,
  resolve,
  themeLabel,
  DEFAULT_THEME,
  DEFAULT_OPACITY,
  OPACITIES,
  themeOf,
  themeForColor,
  parseHex,
};
