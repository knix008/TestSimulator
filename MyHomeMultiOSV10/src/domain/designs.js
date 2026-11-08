// Site designs: the colours, fonts and shapes a website is drawn with. A site names one design
// (site.design.id) and may override any of its values (site.design.overrides). Independent of the
// app's own theme (themes.js): the app can be dark while the site being made is light.

/** Font stacks offered for headings and body text (all installed on the reader's computer or generic). */
export const FONTS = {
  sans: { ko: '고딕 (기본)', en: 'Sans (default)', css: '"Pretendard", "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif' },
  serif: { ko: '명조', en: 'Serif', css: '"Noto Serif KR", "Batang", Georgia, "Times New Roman", serif' },
  rounded: { ko: '둥근 글꼴', en: 'Rounded', css: '"Nunito", "Segoe UI Rounded", "Arial Rounded MT Bold", "Malgun Gothic", system-ui, sans-serif' },
  mono: { ko: '고정폭', en: 'Monospace', css: '"JetBrains Mono", Consolas, "D2Coding", "Courier New", monospace' },
  elegant: { ko: '우아한 글꼴', en: 'Elegant', css: '"Playfair Display", "Noto Serif KR", Georgia, serif' },
  modern: { ko: '모던', en: 'Modern', css: '"Inter", "Helvetica Neue", Arial, "Malgun Gothic", sans-serif' },
  handwriting: { ko: '손글씨', en: 'Handwriting', css: '"Segoe Print", "Comic Sans MS", "Nanum Pen Script", cursive' },
};
export const FONT_IDS = Object.keys(FONTS);

/** The values a design sets. */
export const DESIGN_KEYS = ['primary', 'primaryText', 'accent', 'bg', 'surface', 'text', 'muted', 'border', 'headerBg', 'headerText', 'footerBg', 'footerText', 'headingFont', 'bodyFont', 'radius', 'width', 'baseSize'];

const d = (id, ko, en, dark, c, extra = {}) => ({
  id, ko, en, dark,
  primary: c[0], primaryText: c[1], accent: c[2], bg: c[3], surface: c[4], text: c[5], muted: c[6], border: c[7],
  headerBg: c[8] ?? c[3], headerText: c[9] ?? c[5], footerBg: c[10] ?? c[5], footerText: c[11] ?? c[3],
  headingFont: 'sans', bodyFont: 'sans', radius: 10, width: 1120, baseSize: 17,
  ...extra,
});

/** 36 designs: 24 light, 12 dark. */
export const DESIGNS = [
  d('ocean', '오션', 'Ocean', false, ['#1d6fd8', '#ffffff', '#00b4d8', '#ffffff', '#f2f7fd', '#14243b', '#5b6b80', '#dbe6f3', '#ffffff', '#14243b', '#0f2340', '#dfe9f7']),
  d('forest', '포레스트', 'Forest', false, ['#2f7d4f', '#ffffff', '#a3c13a', '#fbfdf9', '#eef5ec', '#1d2b20', '#5d6e60', '#d6e5d4', '#fbfdf9', '#1d2b20', '#1d3326', '#e3efe2']),
  d('sunset', '선셋', 'Sunset', false, ['#e8590c', '#ffffff', '#f59f00', '#fffaf5', '#fff0e3', '#2b1a10', '#7a5c49', '#f3dcc8', '#fffaf5', '#2b1a10', '#3a1f10', '#ffe8d6']),
  d('rose', '로즈', 'Rose', false, ['#d6336c', '#ffffff', '#f783ac', '#fffafc', '#fff0f5', '#2e1520', '#7d5566', '#f5d5e2', '#fffafc', '#2e1520', '#3b1626', '#ffe3ee'], { headingFont: 'elegant' }),
  d('lavender', '라벤더', 'Lavender', false, ['#7048e8', '#ffffff', '#b197fc', '#fcfbff', '#f3f0ff', '#221a3d', '#655d80', '#e0d9fa', '#fcfbff', '#221a3d', '#251a4a', '#ece6ff']),
  d('mint', '민트', 'Mint', false, ['#0ca678', '#ffffff', '#38d9a9', '#f8fffc', '#e6fcf5', '#12302a', '#557069', '#c8efe2', '#f8fffc', '#12302a', '#0f2f27', '#d3f9eb'], { headingFont: 'rounded', bodyFont: 'rounded', radius: 16 }),
  d('coral', '코랄', 'Coral', false, ['#f06548', '#ffffff', '#ffa94d', '#ffffff', '#fff3ef', '#33201b', '#80625a', '#f6d9d1']),
  d('classic', '클래식', 'Classic', false, ['#1f3a5f', '#ffffff', '#c9a227', '#fdfcf8', '#f4f1e8', '#1d1d1d', '#666052', '#e2dccb', '#1f3a5f', '#ffffff', '#16283f', '#e8e2cf'], { headingFont: 'serif', bodyFont: 'serif', radius: 2 }),
  d('paper', '페이퍼', 'Paper', false, ['#3b3b3b', '#ffffff', '#b08850', '#faf8f3', '#f1ede4', '#2a2722', '#6f685c', '#e2dccf', '#faf8f3', '#2a2722', '#2a2722', '#efe9dc'], { headingFont: 'serif', radius: 4 }),
  d('minimal', '미니멀', 'Minimal', false, ['#111111', '#ffffff', '#555555', '#ffffff', '#f5f5f5', '#111111', '#6b6b6b', '#e5e5e5'], { radius: 0, headingFont: 'modern', bodyFont: 'modern' }),
  d('sky', '스카이', 'Sky', false, ['#228be6', '#ffffff', '#74c0fc', '#f7fbff', '#e7f5ff', '#102a43', '#52667a', '#cfe6fb', '#228be6', '#ffffff', '#0b2440', '#d6ebff'], { radius: 14 }),
  d('lemon', '레몬', 'Lemon', false, ['#f59f00', '#1f1a05', '#fab005', '#fffef5', '#fff9db', '#2c2706', '#6d6534', '#f4e8a9'], { headingFont: 'rounded', radius: 18 }),
  d('earth', '어스', 'Earth', false, ['#8a5a2b', '#ffffff', '#b5835a', '#fcfaf6', '#f3ece2', '#2e2419', '#71624f', '#e3d6c4', '#fcfaf6', '#2e2419', '#3a2a1a', '#efe2d0'], { headingFont: 'serif' }),
  d('teal', '틸', 'Teal', false, ['#0b7285', '#ffffff', '#15aabf', '#f8fdfe', '#e3fafc', '#0f2a30', '#4f6b70', '#c5eaf0']),
  d('berry', '베리', 'Berry', false, ['#a61e4d', '#ffffff', '#e64980', '#fffafb', '#fdf0f4', '#2b1019', '#77505c', '#f1d3dd']),
  d('slate', '슬레이트', 'Slate', false, ['#334155', '#ffffff', '#0ea5e9', '#f8fafc', '#eef2f6', '#0f172a', '#64748b', '#dde3ea', '#ffffff', '#0f172a', '#0f172a', '#e2e8f0'], { headingFont: 'modern', bodyFont: 'modern' }),
  d('peach', '피치', 'Peach', false, ['#e8774a', '#ffffff', '#ffb38a', '#fffaf7', '#ffefe6', '#3a2219', '#80645a', '#f6dccf'], { headingFont: 'rounded', radius: 20 }),
  d('olive', '올리브', 'Olive', false, ['#5c7a1f', '#ffffff', '#94a840', '#fbfcf6', '#f1f4e4', '#232a12', '#646c4e', '#dfe4c6']),
  d('royal', '로열', 'Royal', false, ['#3b2f8f', '#ffffff', '#d4a017', '#fdfcff', '#f1effa', '#1b1638', '#5c5880', '#ddd9f0', '#3b2f8f', '#ffffff', '#1b1638', '#e6e2fa'], { headingFont: 'elegant' }),
  d('candy', '캔디', 'Candy', false, ['#e64980', '#ffffff', '#4dabf7', '#fffbfe', '#fdeef7', '#2d1527', '#7c5a72', '#f3d7e8'], { headingFont: 'rounded', bodyFont: 'rounded', radius: 22 }),
  d('wood', '우드', 'Wood', false, ['#6f4e37', '#ffffff', '#c08552', '#fbf8f4', '#f2eadf', '#2b2018', '#6f6152', '#e2d5c3', '#6f4e37', '#ffffff', '#2b2018', '#efe2cf'], { headingFont: 'serif' }),
  d('fresh', '프레시', 'Fresh', false, ['#37b24d', '#ffffff', '#fcc419', '#ffffff', '#ebfbee', '#16301c', '#56705c', '#cdeed4'], { radius: 14 }),
  d('corporate', '코퍼레이트', 'Corporate', false, ['#0b5cad', '#ffffff', '#ff7a00', '#ffffff', '#f3f6fa', '#16202b', '#5a6776', '#dde4ec', '#0b5cad', '#ffffff', '#0a2540', '#dce6f2'], { headingFont: 'modern', bodyFont: 'modern', radius: 6 }),
  d('wedding', '웨딩', 'Wedding', false, ['#b08968', '#ffffff', '#ddb892', '#fffdf9', '#f8f1e8', '#3d2f24', '#7f6c5d', '#ecdfd0'], { headingFont: 'elegant', bodyFont: 'serif', radius: 30 }),
  d('midnight', '미드나잇', 'Midnight', true, ['#5c7cfa', '#ffffff', '#22b8cf', '#0d1324', '#161f38', '#e6ebff', '#94a0c4', '#26314f', '#0d1324', '#e6ebff', '#070b16', '#aab4d6']),
  d('carbon', '카본', 'Carbon', true, ['#f2f2f2', '#111111', '#ff6b6b', '#121212', '#1e1e1e', '#f2f2f2', '#9a9a9a', '#2e2e2e', '#121212', '#f2f2f2', '#0a0a0a', '#9a9a9a'], { headingFont: 'modern', bodyFont: 'modern', radius: 4 }),
  d('neon', '네온', 'Neon', true, ['#00e5a0', '#06120e', '#ff3cac', '#0a0a14', '#14142a', '#eafff8', '#8d93b8', '#26264a', '#0a0a14', '#eafff8', '#05050c', '#8d93b8'], { headingFont: 'mono' }),
  d('aurora', '오로라', 'Aurora', true, ['#7cdbd5', '#08221f', '#c084fc', '#0b1a22', '#12293a', '#e3f6fb', '#8fb0bf', '#1f3d52']),
  d('ember', '엠버', 'Ember', true, ['#ff8c42', '#1b0d03', '#ffd166', '#1a120d', '#2a1d15', '#fff1e6', '#b39a88', '#3d2a1e']),
  d('deepsea', '딥 시', 'Deep Sea', true, ['#38bdf8', '#03202e', '#34d399', '#071a2b', '#0c2740', '#e0f2fe', '#89a9c2', '#163a59']),
  d('wine', '와인', 'Wine', true, ['#e599b5', '#2a0a16', '#f2c14e', '#1e0d14', '#2e1520', '#fbe9f0', '#b8949f', '#45202f'], { headingFont: 'elegant' }),
  d('graphite', '그래파이트', 'Graphite', true, ['#a5b4fc', '#14152b', '#fbbf24', '#17181c', '#22242a', '#eceef3', '#9ca0ab', '#33363e']),
  d('forestnight', '밤의 숲', 'Night Forest', true, ['#69db7c', '#0b1f10', '#ffd43b', '#0e1a12', '#16271b', '#e6f7ea', '#93ad99', '#24402c']),
  d('galaxy', '갤럭시', 'Galaxy', true, ['#b197fc', '#160c33', '#f783ac', '#0f0b1f', '#1b1536', '#efeaff', '#a49ac4', '#2e2556'], { radius: 16 }),
  d('coffee', '커피', 'Coffee', true, ['#d4a373', '#20140a', '#e9c46a', '#1b1410', '#2a201a', '#f6ece2', '#b5a493', '#3e3128'], { headingFont: 'serif' }),
  d('terminal', '터미널', 'Terminal', true, ['#39ff14', '#031000', '#00e5ff', '#050805', '#0d140d', '#d8ffd0', '#7fa878', '#1c2b1c'], { headingFont: 'mono', bodyFont: 'mono', radius: 0 }),
];
export const DESIGN_IDS = DESIGNS.map((x) => x.id);
export const designById = (id) => DESIGNS.find((x) => x.id === id) ?? DESIGNS[0];

const HEX = /^#[0-9a-f]{6}$/i;
const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** The effective design of a site: the preset with the site's overrides (bad values dropped). */
export function effectiveDesign(design = {}) {
  const base = designById(design?.id);
  const out = { ...base };
  const over = design?.overrides ?? {};
  for (const key of DESIGN_KEYS) {
    const value = over[key];
    if (value == null || value === '') continue;
    if (key.endsWith('Font')) { if (FONT_IDS.includes(value)) out[key] = value; }
    else if (key === 'radius') out.radius = clampNumber(value, 0, 40, base.radius);
    else if (key === 'width') out.width = clampNumber(value, 720, 1600, base.width);
    else if (key === 'baseSize') out.baseSize = clampNumber(value, 13, 22, base.baseSize);
    else if (HEX.test(String(value))) out[key] = String(value).toLowerCase();
  }
  return out;
}

/** Five colours that show a design in a picker. */
export const designSwatch = (design) => [design.bg, design.primary, design.accent, design.text, design.surface];
