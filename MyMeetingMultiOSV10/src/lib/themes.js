// UI themes: 20 dark + 20 light. Tokens drive both the swatches and the CSS
// variables injected below, so a theme only has to be described once.

const VARS = [
  'bg', 'bg-2', 'bg-3', 'panel', 'border', 'text', 'text-dim', 'muted',
  'accent', 'accent-2', 'accent-fg', 'danger', 'shadow',
];

function theme(id, mode, v) {
  const danger = v.danger || (mode === 'light' ? '#c0392b' : '#e06666');
  const shadow = v.shadow || (mode === 'light' ? 'rgba(0, 0, 0, 0.14)' : 'rgba(0, 0, 0, 0.5)');
  return {
    id,
    mode,
    bars: [v.bg, v.bg2, v.accent],
    vars: {
      bg: v.bg,
      'bg-2': v.bg2,
      'bg-3': v.bg3,
      panel: v.panel || v.bg2,
      border: v.border,
      text: v.text,
      'text-dim': v.textDim,
      muted: v.muted,
      accent: v.accent,
      'accent-2': v.accent2,
      'accent-fg': v.accentFg,
      danger,
      shadow,
    },
  };
}

const dark = (id, v) => theme(id, 'dark', v);
const light = (id, v) => theme(id, 'light', v);

export const THEMES = [
  // ── Dark (20) ──────────────────────────────────────────
  dark('dark', {
    bg: '#12100f', bg2: '#1b1917', bg3: '#24211e', border: '#322e2a',
    text: '#ece7e1', textDim: '#a49c92', muted: '#7c756c',
    accent: '#2fb59a', accent2: '#1f8f79', accentFg: '#04211c',
    danger: '#e06666', shadow: 'rgba(0, 0, 0, 0.45)',
  }),
  dark('midnight', {
    bg: '#0d1117', bg2: '#161b22', bg3: '#21262d', border: '#30363d',
    text: '#e6edf3', textDim: '#9aa5b1', muted: '#6e7681',
    accent: '#4493f8', accent2: '#2f6fd0', accentFg: '#ffffff',
    danger: '#f85149', shadow: 'rgba(0, 0, 0, 0.55)',
  }),
  dark('nord', {
    bg: '#2e3440', bg2: '#3b4252', bg3: '#434c5e', border: '#4c566a',
    text: '#eceff4', textDim: '#d8dee9', muted: '#9aa4b8',
    accent: '#88c0d0', accent2: '#5e9aad', accentFg: '#1b2330',
    danger: '#bf616a', shadow: 'rgba(0, 0, 0, 0.45)',
  }),
  dark('forest', {
    bg: '#12180f', bg2: '#1b2416', bg3: '#253020', border: '#33422a',
    text: '#e7f0e0', textDim: '#a7bd99', muted: '#79906a',
    accent: '#8fce5a', accent2: '#6fae3d', accentFg: '#14200a',
    danger: '#e0685f',
  }),
  dark('rose', {
    bg: '#1b1220', bg2: '#251829', bg3: '#322038', border: '#43304a',
    text: '#f3e6f2', textDim: '#c6a9c8', muted: '#937591',
    accent: '#e0559b', accent2: '#bd3f7f', accentFg: '#ffffff',
    danger: '#ef6a5c',
  }),
  dark('contrast', {
    bg: '#000000', bg2: '#0a0a0a', bg3: '#1a1a1a', border: '#5a5a5a',
    text: '#ffffff', textDim: '#d0d0d0', muted: '#a0a0a0',
    accent: '#ffd400', accent2: '#e0bb00', accentFg: '#000000',
    danger: '#ff5555', shadow: 'rgba(0, 0, 0, 0.7)',
  }),
  dark('ocean', {
    bg: '#0b1e2a', bg2: '#122b3a', bg3: '#1a3849', border: '#264a5e',
    text: '#e2f1f7', textDim: '#a7c4d1', muted: '#6f8b98',
    accent: '#3fc1c9', accent2: '#2a9aa2', accentFg: '#04252a',
    danger: '#e0685f',
  }),
  dark('mocha', {
    bg: '#1c1512', bg2: '#261c17', bg3: '#32251d', border: '#43342a',
    text: '#f0e6dd', textDim: '#c3ab99', muted: '#8f7767',
    accent: '#d9a066', accent2: '#bd8449', accentFg: '#2a1c0e',
    danger: '#e0685f', shadow: 'rgba(0, 0, 0, 0.55)',
  }),
  dark('dracula', {
    bg: '#282a36', bg2: '#21222c', bg3: '#343746', border: '#44475a',
    text: '#f8f8f2', textDim: '#cfcfdf', muted: '#8b8da3',
    accent: '#bd93f9', accent2: '#9a6fe0', accentFg: '#1e1a2b',
    danger: '#ff5555',
  }),
  dark('abyss', {
    bg: '#0a0e14', bg2: '#0f141c', bg3: '#171e28', border: '#243040',
    text: '#e6eef7', textDim: '#9fb0c3', muted: '#6d7e92',
    accent: '#39bae6', accent2: '#1f8fb3', accentFg: '#041820',
    danger: '#f07178',
  }),
  dark('slate', {
    bg: '#1e1e2e', bg2: '#181825', bg3: '#313244', border: '#45475a',
    text: '#cdd6f4', textDim: '#a6adc8', muted: '#7f849c',
    accent: '#89b4fa', accent2: '#6c96db', accentFg: '#11111b',
    danger: '#f38ba8',
  }),
  dark('grape', {
    bg: '#160e1e', bg2: '#221432', bg3: '#311c48', border: '#452a60',
    text: '#f6ecff', textDim: '#d2b8e8', muted: '#9a7eaf',
    accent: '#c084fc', accent2: '#9a5fe0', accentFg: '#1a0d28',
    danger: '#fb7185',
  }),
  dark('ember', {
    bg: '#1a100e', bg2: '#261614', bg3: '#351e1a', border: '#4a2c26',
    text: '#fdece8', textDim: '#e2b8b0', muted: '#a67c74',
    accent: '#f07178', accent2: '#d4535c', accentFg: '#2a0d0e',
    danger: '#ff8a65',
  }),
  dark('aurora', {
    bg: '#0e1614', bg2: '#14211c', bg3: '#1c2e28', border: '#2a463c',
    text: '#e7f6ef', textDim: '#b7d4c6', muted: '#7e9e90',
    accent: '#3dd68c', accent2: '#2aaa6c', accentFg: '#062116',
    danger: '#f07178',
  }),
  dark('ink', {
    bg: '#0c1220', bg2: '#141b2d', bg3: '#1c2740', border: '#2c3b5a',
    text: '#e8eeff', textDim: '#b7c3e0', muted: '#7d8aab',
    accent: '#7aa2f7', accent2: '#5b82d6', accentFg: '#0b1224',
    danger: '#f7768e',
  }),
  dark('carbon', {
    bg: '#141414', bg2: '#1e1e1e', bg3: '#2a2a2a', border: '#3a3a3a',
    text: '#f2f2f2', textDim: '#c4c4c4', muted: '#8a8a8a',
    accent: '#56d4dd', accent2: '#3aadb6', accentFg: '#042022',
    danger: '#ff6b6b',
  }),
  dark('wine', {
    bg: '#160d12', bg2: '#24141b', bg3: '#341c26', border: '#4a2836',
    text: '#fdecef', textDim: '#e4b8c4', muted: '#a67c8a',
    accent: '#e06c75', accent2: '#c14e5a', accentFg: '#2a0c12',
    danger: '#ff8a80',
  }),
  dark('lagoon', {
    bg: '#07161a', bg2: '#0e242b', bg3: '#15323b', border: '#1f4652',
    text: '#e5f7f8', textDim: '#b5d5d8', muted: '#7a9ea3',
    accent: '#2dd4bf', accent2: '#14b8a6', accentFg: '#042421',
    danger: '#fb7185',
  }),
  dark('dusk', {
    bg: '#12111f', bg2: '#1c1a30', bg3: '#282542', border: '#3a355c',
    text: '#eeeaff', textDim: '#c8c2e4', muted: '#8e87ad',
    accent: '#a78bfa', accent2: '#8b6fe0', accentFg: '#160f2e',
    danger: '#f472b6',
  }),
  dark('amber', {
    bg: '#16120c', bg2: '#241c12', bg3: '#332616', border: '#4a3820',
    text: '#fbf3e6', textDim: '#e2cfb0', muted: '#a89070',
    accent: '#f0b429', accent2: '#d4991a', accentFg: '#2a1c04',
    danger: '#f07178',
  }),

  // ── Light (20) ─────────────────────────────────────────
  light('light', {
    bg: '#f3f1ee', bg2: '#ffffff', bg3: '#eceae6', border: '#dcd8d2',
    text: '#26221e', textDim: '#5f584f', muted: '#8c847a',
    accent: '#1f8f79', accent2: '#17715f', accentFg: '#ffffff',
    danger: '#c0392b', shadow: 'rgba(0, 0, 0, 0.15)',
  }),
  light('white', {
    bg: '#ffffff', bg2: '#ffffff', bg3: '#f4f4f5', border: '#e2e2e6',
    text: '#17171a', textDim: '#55555c', muted: '#8b8b92',
    accent: '#1f8f79', accent2: '#17715f', accentFg: '#ffffff',
    danger: '#c0392b', shadow: 'rgba(0, 0, 0, 0.12)',
  }),
  light('solarized', {
    bg: '#fdf6e3', bg2: '#fbf1d8', bg3: '#eee8d5', border: '#ddd6c1',
    text: '#073642', textDim: '#586e75', muted: '#93a1a1',
    accent: '#268bd2', accent2: '#1c6fa8', accentFg: '#ffffff',
    danger: '#dc322f', shadow: 'rgba(0, 0, 0, 0.18)',
  }),
  light('sky', {
    bg: '#eef4fb', bg2: '#ffffff', bg3: '#e2ecf7', border: '#cfdcec',
    text: '#132030', textDim: '#4c5e73', muted: '#8496aa',
    accent: '#2f7fe0', accent2: '#2264b6', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('paper', {
    bg: '#f7f3ea', bg2: '#fffdf8', bg3: '#efe8da', border: '#e0d5c3',
    text: '#2c2416', textDim: '#6b5c45', muted: '#9a8b74',
    accent: '#b45309', accent2: '#92400e', accentFg: '#ffffff',
    danger: '#b91c1c',
  }),
  light('mint', {
    bg: '#f1faf6', bg2: '#ffffff', bg3: '#e3f4ec', border: '#c9e6d8',
    text: '#10261c', textDim: '#3d6454', muted: '#7b9b8c',
    accent: '#0f9d73', accent2: '#0b7d5b', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('sand', {
    bg: '#f6f1e7', bg2: '#fffaf2', bg3: '#efe6d6', border: '#e2d3bb',
    text: '#2a2418', textDim: '#6a5b42', muted: '#9a8a70',
    accent: '#c47b2d', accent2: '#a3641e', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('lavender', {
    bg: '#f4f1fb', bg2: '#ffffff', bg3: '#ebe4f7', border: '#d9d0ea',
    text: '#241b33', textDim: '#5c4d73', muted: '#9184a6',
    accent: '#7c5cbf', accent2: '#6544a3', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('blossom', {
    bg: '#fdf2f6', bg2: '#ffffff', bg3: '#f8e4ec', border: '#f0d0dc',
    text: '#2e1822', textDim: '#734456', muted: '#a88494',
    accent: '#d4537e', accent2: '#b53d68', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('frost', {
    bg: '#f2f5f8', bg2: '#ffffff', bg3: '#e6edf3', border: '#d3dee8',
    text: '#15202b', textDim: '#4a5c6e', muted: '#8496a8',
    accent: '#3b6ea5', accent2: '#2d5684', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('cream', {
    bg: '#fff8ee', bg2: '#fffdf8', bg3: '#f8edd9', border: '#eddcbd',
    text: '#2b2112', textDim: '#6d5836', muted: '#a08b68',
    accent: '#d97706', accent2: '#b45309', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('sage', {
    bg: '#f3f6f1', bg2: '#ffffff', bg3: '#e6eee3', border: '#d2e0cc',
    text: '#1a2616', textDim: '#4d6246', muted: '#84967c',
    accent: '#4f7c4a', accent2: '#3d6439', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('porcelain', {
    bg: '#f7f7f8', bg2: '#ffffff', bg3: '#ececf1', border: '#d9d9e2',
    text: '#1c1c22', textDim: '#52525e', muted: '#8b8b98',
    accent: '#3d5a80', accent2: '#2e4666', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('peach', {
    bg: '#fff5ef', bg2: '#ffffff', bg3: '#fde8dc', border: '#f4d2c2',
    text: '#2c1a12', textDim: '#734e3c', muted: '#a88876',
    accent: '#e06a3a', accent2: '#c45428', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('fog', {
    bg: '#f4f4f5', bg2: '#ffffff', bg3: '#e8e8ec', border: '#d6d6dc',
    text: '#1c1c1f', textDim: '#52525b', muted: '#8a8a94',
    accent: '#52525b', accent2: '#3f3f46', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('lemon', {
    bg: '#fffbea', bg2: '#fffef5', bg3: '#f8f0c4', border: '#eadf9a',
    text: '#2a2408', textDim: '#6b5d20', muted: '#9a8a4e',
    accent: '#a16207', accent2: '#854d0e', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('aqua', {
    bg: '#f0fbfb', bg2: '#ffffff', bg3: '#dff4f4', border: '#c5e6e6',
    text: '#102424', textDim: '#3d6464', muted: '#7b9b9b',
    accent: '#0e8a8a', accent2: '#0c6e6e', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('lilac', {
    bg: '#f7f4fc', bg2: '#ffffff', bg3: '#eee8f8', border: '#ddd4ee',
    text: '#221833', textDim: '#5c4d73', muted: '#9184a8',
    accent: '#8b5cf6', accent2: '#7039e0', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
  light('coral', {
    bg: '#fff4f2', bg2: '#ffffff', bg3: '#ffe4e0', border: '#f8cdc6',
    text: '#2c1412', textDim: '#734440', muted: '#a88480',
    accent: '#e11d48', accent2: '#be123c', accentFg: '#ffffff',
    danger: '#9f1239',
  }),
  light('snow', {
    bg: '#f8fafc', bg2: '#ffffff', bg3: '#e8eef5', border: '#d5e0eb',
    text: '#0f172a', textDim: '#475569', muted: '#94a3b8',
    accent: '#0284c7', accent2: '#0369a1', accentFg: '#ffffff',
    danger: '#c0392b',
  }),
];

export const THEME_CSS = THEMES.map((th) => {
  const body = VARS.map((k) => `--${k}:${th.vars[k]}`).join(';');
  const sel = th.id === 'dark'
    ? ':root,:root[data-theme="dark"]'
    : `:root[data-theme="${th.id}"]`;
  return `${sel}{${body}}`;
}).join('\n');

if (typeof document !== 'undefined' && !document.getElementById('mtg-themes')) {
  const el = document.createElement('style');
  el.id = 'mtg-themes';
  el.textContent = THEME_CSS;
  document.head.appendChild(el);
}

export function themeById(id) {
  return THEMES.find((th) => th.id === id) || null;
}

export function themeMode(id) {
  return themeById(id)?.mode || 'dark';
}

export function themesByMode(mode) {
  return THEMES.filter((th) => th.mode === mode);
}

// Next theme inside the same family (dark stays dark, light stays light).
export function nextThemeId(id) {
  const cur = themeById(id) || THEMES[0];
  const group = themesByMode(cur.mode);
  const i = Math.max(0, group.findIndex((th) => th.id === cur.id));
  return group[(i + 1) % group.length].id;
}

const PREF_KEY = { dark: 'mtg-theme-dark', light: 'mtg-theme-light' };

export function rememberThemePref(id) {
  const th = themeById(id);
  if (!th) return;
  try { localStorage.setItem(PREF_KEY[th.mode], th.id); } catch { /* ignore */ }
}

// Theme to use for a color-scheme mode while "Auto" follows the system.
export function preferredThemeForMode(mode) {
  const fallback = mode === 'light' ? 'light' : 'dark';
  try {
    const id = localStorage.getItem(PREF_KEY[mode] || '');
    const th = themeById(id);
    if (th && th.mode === mode) return th.id;
  } catch { /* ignore */ }
  return fallback;
}

export function systemThemeMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
