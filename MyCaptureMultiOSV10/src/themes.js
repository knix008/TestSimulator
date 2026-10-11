// 20 light + 20 dark themes (the same palettes as the other My* apps), a
// user-defined theme, and "system" (follows the OS light/dark preference).
// A theme is a set of CSS variables applied to <html>.

export const SYSTEM = 'system';
export const CUSTOM = 'custom';

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const parse = (hex) => {
  const h = String(hex ?? '#000000').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
};
const toHex = (parts) => `#${parts.map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
export const blend = (from, to, amount) => {
  const a = parse(from);
  const b = parse(to);
  const t = Math.min(1, Math.max(0, amount));
  return toHex(a.map((value, i) => value + (b[i] - value) * t));
};
const shift = (hex, delta) => toHex(parse(hex).map((value) => value + delta));
const luminance = (hex) => {
  const [r, g, b] = parse(hex).map((value) => value / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio between two colours. */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Text colour (white or near-black) with the better contrast on top of `hex`. */
export const onColor = (hex) => (contrastRatio('#ffffff', hex) >= contrastRatio('#14171c', hex) ? '#ffffff' : '#14171c');
export const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function build(mode, id, nameKo, nameEn, c) {
  const light = mode === 'light';
  return {
    id,
    mode,
    nameKo,
    nameEn,
    swatch: [c.bg, c.panel, c.accent],
    vars: {
      '--bg': c.bg,
      '--panel': c.panel,
      '--panel-2': c.alt,
      '--line': c.line,
      '--line-strong': blend(c.line, c.ink, light ? 0.18 : 0.14),
      '--text': c.ink,
      '--muted': c.muted,
      '--faint': blend(c.muted, c.panel, 0.38),
      '--accent': c.accent,
      '--accent-soft': c.soft,
      '--accent-text': onColor(c.accent),
      '--rec': c.danger,
      '--rec-soft': blend(c.panel, c.danger, light ? 0.12 : 0.2),
      '--ok': light ? '#1f8a4c' : '#4cc27f',
      '--ok-soft': blend(c.panel, light ? '#1f8a4c' : '#4cc27f', light ? 0.12 : 0.18),
      '--warn': light ? '#9a6400' : '#e0a83a',
      '--warn-soft': blend(c.panel, light ? '#e0a83a' : '#e0a83a', light ? 0.16 : 0.16),
      '--stage': light ? shift(c.bg, -10) : shift(c.bg, -5),
      '--shadow': light ? '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08)' : '0 1px 2px rgba(0, 0, 0, 0.4)',
    },
  };
}

// mode, id, ko, en, bg, panel, ink, muted, line, accent, soft, header(alt), danger
const T = (mode, suffix, ko, en, bg, panel, ink, muted, line, accent, soft, alt, danger) =>
  build(mode, `${mode}-${suffix}`, ko, en, { bg, panel, ink, muted, line, accent, soft, alt, danger });

export const THEMES = [
  T('light', 'classic', '클래식', 'Classic', '#f3f4f6', '#ffffff', '#1f2328', '#667085', '#d8dbe2', '#2563eb', '#e8efff', '#f6f7f9', '#dc2626'),
  T('light', 'paper', '종이', 'Paper', '#f6f1e7', '#fffaf3', '#3f3428', '#8a7564', '#e4d8c8', '#9a3412', '#f8ebe3', '#f8f2e9', '#b45309'),
  T('light', 'snow', '눈', 'Snow', '#f4f7fb', '#ffffff', '#1e293b', '#64748b', '#dbe3ee', '#0284c7', '#e0f2fe', '#f5f8fc', '#e11d48'),
  T('light', 'mint', '민트', 'Mint', '#f3faf6', '#ffffff', '#14352b', '#5f7d72', '#d5e7de', '#059669', '#e7f7ee', '#f4faf7', '#dc2626'),
  T('light', 'sand', '모래', 'Sand', '#f7f3ea', '#fffdf8', '#3d3426', '#8d7b64', '#e6dccb', '#b45309', '#fef3c7', '#f8f4ec', '#c2410c'),
  T('light', 'rose', '장미', 'Rose', '#fdf2f4', '#ffffff', '#3f1d2a', '#9d6b7b', '#f3d5dc', '#e11d48', '#ffe4e6', '#fdf4f6', '#be123c'),
  T('light', 'lavender', '라벤더', 'Lavender', '#f6f4fb', '#ffffff', '#2e1065', '#7c6a9a', '#e4dff0', '#7c3aed', '#f3e8ff', '#f8f6fc', '#db2777'),
  T('light', 'sky', '하늘', 'Sky', '#f0f9ff', '#ffffff', '#0c4a6e', '#5b7c90', '#d5e8f2', '#0284c7', '#e0f2fe', '#f2f9fe', '#e11d48'),
  T('light', 'lemon', '레몬', 'Lemon', '#fbf8ef', '#fffef8', '#3f3a1e', '#8a8158', '#ebe4c4', '#ca8a04', '#fef9c3', '#fbf9f0', '#dc2626'),
  T('light', 'ocean', '바다', 'Ocean', '#eef3f7', '#f8fbfc', '#163042', '#5d7384', '#d3dee6', '#0f766e', '#ccfbf1', '#f0f4f7', '#dc2626'),
  T('light', 'forest', '숲', 'Forest', '#f2f6f1', '#fbfdfb', '#1c3324', '#5e7564', '#d4e0d6', '#15803d', '#dcfce7', '#f3f7f3', '#b91c1c'),
  T('light', 'cherry', '체리', 'Cherry', '#fff5f5', '#ffffff', '#451a1a', '#9a6a6a', '#f3d6d6', '#dc2626', '#fee2e2', '#fff6f6', '#9f1239'),
  T('light', 'graphite', '흑연', 'Graphite', '#f2f2f2', '#fafafa', '#1a1a1a', '#6b6b6b', '#d9d9d9', '#404040', '#ececec', '#f4f4f4', '#dc2626'),
  T('light', 'pearl', '진주', 'Pearl', '#f7f5f2', '#fffcf9', '#2c2825', '#7d746c', '#e5dfd8', '#57534e', '#f5f0eb', '#f8f6f3', '#c2410c'),
  T('light', 'aqua', '아쿠아', 'Aqua', '#f0fdfa', '#ffffff', '#134e4a', '#5f8a86', '#d1efeb', '#0d9488', '#ccfbf1', '#f2fdfb', '#e11d48'),
  T('light', 'blossom', '꽃', 'Blossom', '#fff7fb', '#ffffff', '#4a1942', '#946888', '#f3d7ea', '#db2777', '#fce7f3', '#fff8fb', '#be123c'),
  T('light', 'amber', '호박', 'Amber', '#fff8ef', '#ffffff', '#431407', '#9a6b45', '#f3e0c8', '#d97706', '#ffedd5', '#fff9f1', '#dc2626'),
  T('light', 'indigo', '남색', 'Indigo', '#f4f6fb', '#ffffff', '#1e1b4b', '#6d6a8d', '#dfe3f1', '#4338ca', '#e0e7ff', '#f6f7fc', '#e11d48'),
  T('light', 'sage', '세이지', 'Sage', '#f4f6f2', '#fbfcf8', '#2a3324', '#6d7864', '#dde3d6', '#4d7c0f', '#ecfccb', '#f5f7f3', '#b91c1c'),
  T('light', 'porcelain', '자기', 'Porcelain', '#f8fafc', '#ffffff', '#0f172a', '#64748b', '#e2e8f0', '#0369a1', '#e0f2fe', '#f8fafc', '#e11d48'),

  T('dark', 'midnight', '자정', 'Midnight', '#0f1419', '#161b22', '#e6edf3', '#8b949e', '#30363d', '#58a6ff', '#1c2d41', '#1c2128', '#f85149'),
  T('dark', 'ink', '잉크', 'Ink', '#121212', '#1c1c1c', '#f2f2f2', '#a3a3a3', '#2e2e2e', '#d4d4d4', '#2a2a2a', '#222222', '#f87171'),
  T('dark', 'navy', '네이비', 'Navy', '#0b1220', '#111a2e', '#e2e8f0', '#94a3b8', '#243049', '#60a5fa', '#1e293b', '#16213a', '#fb7185'),
  T('dark', 'grove', '밤숲', 'Grove', '#0e1612', '#15201a', '#e7f5ec', '#8eaa98', '#2a3b32', '#34d399', '#16352b', '#1a2720', '#f87171'),
  T('dark', 'wine', '와인', 'Wine', '#1a1014', '#24161c', '#f8e8ee', '#c4a3b0', '#3d2832', '#fb7185', '#3f1d2e', '#2c1b22', '#fda4af'),
  T('dark', 'slate', '슬레이트', 'Slate', '#0f172a', '#1e293b', '#e2e8f0', '#94a3b8', '#334155', '#38bdf8', '#1e3a4c', '#25324a', '#f87171'),
  T('dark', 'ember', '잔불', 'Ember', '#1a120b', '#24180f', '#f8efe6', '#c4b3a3', '#3d2e22', '#fb923c', '#3b2414', '#2c1e14', '#f87171'),
  T('dark', 'violet', '보라', 'Violet', '#140f1f', '#1c152b', '#f3e8ff', '#c4b5d6', '#342848', '#c084fc', '#2a2040', '#231a35', '#fb7185'),
  T('dark', 'graphite', '흑연', 'Graphite', '#18181b', '#232326', '#f4f4f5', '#a1a1aa', '#3f3f46', '#a1a1aa', '#2a2a2e', '#2a2a2e', '#f87171'),
  T('dark', 'trench', '심해', 'Trench', '#071316', '#0e1c20', '#e6f4f6', '#8fb4b8', '#1e3338', '#2dd4bf', '#12343a', '#132428', '#fb7185'),
  T('dark', 'coffee', '커피', 'Coffee', '#1c1410', '#271c16', '#f6efe8', '#cbb8a8', '#3e3028', '#e2b07a', '#3a2a20', '#2f231c', '#f87171'),
  T('dark', 'aurora', '오로라', 'Aurora', '#0b1218', '#121a22', '#e8f7ff', '#9bb4c4', '#243240', '#67e8f9', '#12323a', '#18222c', '#fb7185'),
  T('dark', 'carbon', '카본', 'Carbon', '#0c0c0c', '#141414', '#ededed', '#9a9a9a', '#2a2a2a', '#f5f5f5', '#262626', '#1a1a1a', '#f87171'),
  T('dark', 'plum', '자두', 'Plum', '#160f18', '#211621', '#f8eef8', '#c7aec7', '#3a2a3a', '#e879f9', '#3b2040', '#2a1c2a', '#fb7185'),
  T('dark', 'storm', '폭풍', 'Storm', '#12161c', '#1a212b', '#e8eef6', '#9aabbd', '#2c3644', '#93c5fd', '#1e2a3a', '#212935', '#f87171'),
  T('dark', 'copper', '구리', 'Copper', '#18120e', '#221812', '#f8efe8', '#cbb5a6', '#3c2e26', '#f0a06a', '#3d291c', '#2a1f18', '#f87171'),
  T('dark', 'arctic', '북극', 'Arctic', '#2e3440', '#3b4252', '#eceff4', '#d8dee9', '#4c566a', '#88c0d0', '#3b4a5a', '#434c5e', '#bf616a'),
  T('dark', 'orchid', '난초', 'Orchid', '#1b1520', '#261c2c', '#f6e9f8', '#cbb6d0', '#3d3144', '#f0abfc', '#3a2744', '#2e2335', '#fb7185'),
  T('dark', 'olive', '올리브', 'Olive', '#14160f', '#1c1f14', '#f1f5e6', '#b7c2a4', '#323828', '#bef264', '#2a3318', '#23271a', '#f87171'),
  T('dark', 'ice', '얼음', 'Ice', '#0d141c', '#141c27', '#e8f1fb', '#9eb0c4', '#2a3848', '#7dd3fc', '#163044', '#1a2431', '#fb7185'),
];

export const LIGHT_DEFAULT = 'light-classic';
export const DARK_DEFAULT = 'dark-midnight';

export const CUSTOM_FIELDS = ['bg', 'panel', 'text', 'muted', 'border', 'accent', 'danger'];

export function defaultCustom() {
  return { mode: 'dark', bg: '#15181d', panel: '#1d2127', text: '#e6e9ee', muted: '#9aa4b1', border: '#2d333b', accent: '#3d9be9', danger: '#f05454' };
}

/** Keeps only valid colours; anything missing or broken falls back to the default. */
export function sanitizeCustom(raw) {
  const base = defaultCustom();
  const value = raw && typeof raw === 'object' ? raw : {};
  const out = { mode: value.mode === 'light' ? 'light' : value.mode === 'dark' ? 'dark' : base.mode };
  for (const field of CUSTOM_FIELDS) out[field] = isHexColor(value[field]) ? value[field].toLowerCase() : base[field];
  return out;
}

export function fromCustom(raw) {
  const c = sanitizeCustom(raw);
  const light = c.mode === 'light';
  return build(c.mode, CUSTOM, '사용자 정의', 'Custom', {
    bg: c.bg,
    panel: c.panel,
    ink: c.text,
    muted: c.muted,
    line: c.border,
    accent: c.accent,
    soft: blend(c.panel, c.accent, light ? 0.14 : 0.24),
    alt: light ? shift(c.panel, -5) : shift(c.panel, 6),
    danger: c.danger,
  });
}

export const themeIds = () => [...THEMES.map((theme) => theme.id), CUSTOM];

export const isThemeId = (id) => id === SYSTEM || themeIds().includes(id);

/** The theme to apply for a setting (`system` follows the OS preference). */
export function resolveTheme(id, custom, prefersDark) {
  if (id === CUSTOM) return fromCustom(custom);
  const wanted = id === SYSTEM || !isThemeId(id) ? (prefersDark ? DARK_DEFAULT : LIGHT_DEFAULT) : id;
  return THEMES.find((theme) => theme.id === wanted) ?? THEMES[0];
}

/** Next theme for the cycle button: the 40 themes, then custom, then around. */
export function nextTheme(id, prefersDark = false) {
  const list = themeIds();
  const current = id === SYSTEM ? (prefersDark ? DARK_DEFAULT : LIGHT_DEFAULT) : id;
  const index = list.indexOf(current);
  return list[(index + 1) % list.length];
}

export const themeName = (theme, language) => (language === 'en' ? theme.nameEn : theme.nameKo);

/** Applies a theme to the document. */
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  root.style.colorScheme = theme.mode;
  root.dataset.themeMode = theme.mode;
  root.dataset.theme = theme.id;
}
