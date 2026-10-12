// Themes: flat token maps applied to :root as CSS custom properties, so every
// surface — main window and dialog windows alike — picks up the same palette.
//
// 40 built-in themes, 20 dark and 20 light. Custom themes live in settings and
// are turned into the same shape by `themeFromCustom`. `mk` fills derived
// tokens (hover / active / canvas / shadow) from the colours that define a look.

function mk(id, label, labelEn, mode, c) {
  const dark = mode === 'dark';
  return {
    id, label, labelEn, mode,
    tokens: {
      '--bg': c.bg,
      '--bg-raised': c.raised,
      '--bg-panel': c.panel,
      '--bg-input': c.input,
      '--bg-hover': c.hover,
      '--bg-active': c.active,
      '--bg-canvas': c.canvas,
      '--border': c.border,
      '--border-strong': c.borderStrong,
      '--text': c.text,
      '--text-dim': c.textDim,
      '--text-faint': c.textFaint,
      '--accent': c.accent,
      '--accent-strong': c.accentStrong,
      '--accent-text': c.accentText,
      '--danger': c.danger || (dark ? '#ff6b6b' : '#c62828'),
      '--danger-bg': c.dangerBg || (dark ? '#3a1c22' : '#fde7e7'),
      '--warning': c.warning || (dark ? '#ffb703' : '#b26a00'),
      '--ok': c.ok || (dark ? '#4ade80' : '#2e7d32'),
      '--shadow': c.shadow || (dark ? '0 8px 28px rgba(0,0,0,0.5)' : '0 8px 28px rgba(20,30,50,0.18)'),
      '--titlebar': c.titlebar,
      '--selection': c.accent,
    },
  };
}

const DARK = [
  mk('midnight', '미드나이트', 'Midnight', 'dark', {
    bg: '#12161c', raised: '#1a2029', panel: '#161b23', input: '#0e1218', hover: '#232b36', active: '#2b3644', canvas: '#0b0e12',
    border: '#2a3441', borderStrong: '#3b4859', text: '#e4e9f0', textDim: '#97a3b4', textFaint: '#6b7789',
    accent: '#4cc9f0', accentStrong: '#4361ee', accentText: '#06202b', titlebar: '#0e1217',
  }),
  mk('graphite', '그라파이트', 'Graphite', 'dark', {
    bg: '#1e1e1e', raised: '#262626', panel: '#222222', input: '#171717', hover: '#303030', active: '#3a3a3a', canvas: '#141414',
    border: '#353535', borderStrong: '#4a4a4a', text: '#ececec', textDim: '#a8a8a8', textFaint: '#767676',
    accent: '#ffb347', accentStrong: '#f28c28', accentText: '#1e1200', titlebar: '#181818',
  }),
  mk('ocean', '오션', 'Ocean', 'dark', {
    bg: '#0f1f2a', raised: '#153040', panel: '#122735', input: '#0b1720', hover: '#1d3d50', active: '#254b62', canvas: '#081319',
    border: '#234456', borderStrong: '#33607a', text: '#e2f1f8', textDim: '#9cc0d3', textFaint: '#6a8fa3',
    accent: '#2ee6c5', accentStrong: '#14b8a6', accentText: '#03211c', titlebar: '#0b1922',
  }),
  mk('forest', '포레스트', 'Forest', 'dark', {
    bg: '#151d17', raised: '#1d2a20', panel: '#19241c', input: '#0f1611', hover: '#26372a', active: '#2f4534', canvas: '#0c120e',
    border: '#2c3f31', borderStrong: '#3f5a46', text: '#e8f0e9', textDim: '#a3b8a7', textFaint: '#748a78',
    accent: '#8be26a', accentStrong: '#4caf50', accentText: '#0b1a08', titlebar: '#101712',
  }),
  mk('contrast', '고대비', 'High Contrast', 'dark', {
    bg: '#000000', raised: '#0d0d0d', panel: '#080808', input: '#000000', hover: '#1f1f1f', active: '#333333', canvas: '#000000',
    border: '#6f6f6f', borderStrong: '#ffffff', text: '#ffffff', textDim: '#e0e0e0', textFaint: '#b0b0b0',
    accent: '#ffff00', accentStrong: '#ffd600', accentText: '#000000', titlebar: '#000000', shadow: '0 0 0 2px #ffffff',
  }),
  mk('nord', '노르드', 'Nord', 'dark', {
    bg: '#2e3440', raised: '#3b4252', panel: '#343b4a', input: '#272c36', hover: '#434c5e', active: '#4c566a', canvas: '#242933',
    border: '#434c5e', borderStrong: '#5b667a', text: '#eceff4', textDim: '#d8dee9', textFaint: '#9aa5b8',
    accent: '#88c0d0', accentStrong: '#5e81ac', accentText: '#1b2430', titlebar: '#272c36', danger: '#bf616a', dangerBg: '#4a2f33', warning: '#ebcb8b', ok: '#a3be8c',
  }),
  mk('dracula', '드라큘라', 'Dracula', 'dark', {
    bg: '#282a36', raised: '#343746', panel: '#2d2f3d', input: '#21222c', hover: '#3d4052', active: '#44475a', canvas: '#1e1f29',
    border: '#44475a', borderStrong: '#6272a4', text: '#f8f8f2', textDim: '#bfc2d0', textFaint: '#8a8ea8',
    accent: '#bd93f9', accentStrong: '#ff79c6', accentText: '#1a1023', titlebar: '#21222c', danger: '#ff5555', dangerBg: '#4a2a33', warning: '#f1fa8c', ok: '#50fa7b',
  }),
  mk('solarizedDark', '솔라라이즈드 다크', 'Solarized Dark', 'dark', {
    bg: '#002b36', raised: '#073642', panel: '#03303c', input: '#00222b', hover: '#0d4452', active: '#175261', canvas: '#00202a',
    border: '#0d4452', borderStrong: '#2a6b7c', text: '#eee8d5', textDim: '#93a1a1', textFaint: '#657b83',
    accent: '#2aa198', accentStrong: '#268bd2', accentText: '#00201c', titlebar: '#00222b', danger: '#dc322f', dangerBg: '#4a1f22', warning: '#b58900', ok: '#859900',
  }),
  mk('monokai', '모노카이', 'Monokai', 'dark', {
    bg: '#272822', raised: '#32332c', panel: '#2c2d26', input: '#1f201b', hover: '#3c3d36', active: '#49483e', canvas: '#1c1d18',
    border: '#3e3f38', borderStrong: '#5b5c52', text: '#f8f8f2', textDim: '#c8c8bf', textFaint: '#90917f',
    accent: '#a6e22e', accentStrong: '#e6db74', accentText: '#1b1f0a', titlebar: '#1f201b', danger: '#f92672', dangerBg: '#4a1e33', warning: '#fd971f', ok: '#a6e22e',
  }),
  mk('coffee', '커피', 'Coffee', 'dark', {
    bg: '#1f1a17', raised: '#2a2320', panel: '#241e1b', input: '#171310', hover: '#352c27', active: '#41362f', canvas: '#14100e',
    border: '#3a302a', borderStrong: '#55463d', text: '#f1e9e2', textDim: '#bfae9f', textFaint: '#8a7a6d',
    accent: '#e0a458', accentStrong: '#c47f2b', accentText: '#221300', titlebar: '#171310',
  }),
  mk('abyss', '어비스', 'Abyss', 'dark', {
    bg: '#070b16', raised: '#10182a', panel: '#0c1322', input: '#050814', hover: '#18243c', active: '#223054', canvas: '#04060f',
    border: '#1c2a48', borderStrong: '#31467a', text: '#e6ecff', textDim: '#9aabc9', textFaint: '#6d7c9c',
    accent: '#6ea8ff', accentStrong: '#3d7eff', accentText: '#041226', titlebar: '#050814',
  }),
  mk('ember', '엠버', 'Ember', 'dark', {
    bg: '#1a1010', raised: '#2a1816', panel: '#221412', input: '#140c0c', hover: '#3a221e', active: '#4a2c26', canvas: '#100a0a',
    border: '#4a2e28', borderStrong: '#6e463c', text: '#f8ece8', textDim: '#c9aaa2', textFaint: '#947870',
    accent: '#ff6b3d', accentStrong: '#e23d1a', accentText: '#2a0c04', titlebar: '#140c0c',
  }),
  mk('orchid', '오키드', 'Orchid', 'dark', {
    bg: '#16121c', raised: '#241c2e', panel: '#1e1826', input: '#100c16', hover: '#32243e', active: '#403050', canvas: '#0e0a14',
    border: '#3a2c4a', borderStrong: '#58406e', text: '#f4eef8', textDim: '#c2b0d0', textFaint: '#8e7aa0',
    accent: '#d07bff', accentStrong: '#a64dff', accentText: '#1c0828', titlebar: '#100c16',
  }),
  mk('slate', '슬레이트', 'Slate', 'dark', {
    bg: '#1b212b', raised: '#262e3a', panel: '#222a35', input: '#151b24', hover: '#313b4a', active: '#3d4a5c', canvas: '#121820',
    border: '#364252', borderStrong: '#4e6076', text: '#e7eef6', textDim: '#a8b6c8', textFaint: '#748398',
    accent: '#67d5ff', accentStrong: '#3aa8d8', accentText: '#04202a', titlebar: '#151b24',
  }),
  mk('ink', '잉크', 'Ink', 'dark', {
    bg: '#0c1214', raised: '#162024', panel: '#121a1c', input: '#081012', hover: '#1e2e32', active: '#283e44', canvas: '#070c0e',
    border: '#243438', borderStrong: '#3a565c', text: '#e4f2f4', textDim: '#9db8bc', textFaint: '#6d888c',
    accent: '#3ee0c5', accentStrong: '#14b89a', accentText: '#04221c', titlebar: '#081012',
  }),
  mk('wine', '와인', 'Wine', 'dark', {
    bg: '#1a1016', raised: '#2c1822', panel: '#24141c', input: '#140c12', hover: '#3c2230', active: '#4e2c3e', canvas: '#120a10',
    border: '#462836', borderStrong: '#6a3c52', text: '#f8eaf0', textDim: '#c9a8b6', textFaint: '#947888',
    accent: '#ff5d8f', accentStrong: '#e0306a', accentText: '#2a0612', titlebar: '#140c12',
  }),
  mk('aurora', '오로라', 'Aurora', 'dark', {
    bg: '#10141c', raised: '#1a2230', panel: '#161c28', input: '#0c1018', hover: '#243044', active: '#2e3e58', canvas: '#0a0e14',
    border: '#2c3a50', borderStrong: '#46607c', text: '#eaf2ff', textDim: '#a8b8d0', textFaint: '#7484a0',
    accent: '#7dffb3', accentStrong: '#3ad6ff', accentText: '#062016', titlebar: '#0c1018',
  }),
  mk('neon', '네온', 'Neon', 'dark', {
    bg: '#0a0a12', raised: '#161622', panel: '#12121c', input: '#07070e', hover: '#222234', active: '#2e2e48', canvas: '#06060c',
    border: '#2a2a44', borderStrong: '#46466e', text: '#f2f2ff', textDim: '#b0b0d0', textFaint: '#7878a0',
    accent: '#ff4dcd', accentStrong: '#7a5cff', accentText: '#240018', titlebar: '#07070e',
  }),
  mk('storm', '스톰', 'Storm', 'dark', {
    bg: '#1a1e24', raised: '#262c34', panel: '#22282f', input: '#14181e', hover: '#323a44', active: '#404a56', canvas: '#12161c',
    border: '#3a4450', borderStrong: '#566474', text: '#e8eef4', textDim: '#aeb8c4', textFaint: '#7c8896',
    accent: '#f0c14a', accentStrong: '#d99a1a', accentText: '#241800', titlebar: '#14181e',
  }),
  mk('obsidian', '옵시디언', 'Obsidian', 'dark', {
    bg: '#101114', raised: '#1a1c22', panel: '#16181e', input: '#0c0d10', hover: '#262830', active: '#32343e', canvas: '#0a0b0e',
    border: '#2e3038', borderStrong: '#484a56', text: '#eceef4', textDim: '#b0b4c0', textFaint: '#7c808c',
    accent: '#9aa7ff', accentStrong: '#6d7cff', accentText: '#0c1028', titlebar: '#0c0d10',
  }),
];

const LIGHT = [
  mk('daylight', '데이라이트', 'Daylight', 'light', {
    bg: '#f6f7f9', raised: '#ffffff', panel: '#eef1f5', input: '#ffffff', hover: '#e4e9f0', active: '#d6dee9', canvas: '#dfe4ea',
    border: '#d3dae3', borderStrong: '#aab6c5', text: '#1c2530', textDim: '#586372', textFaint: '#8a94a3',
    accent: '#1565c0', accentStrong: '#0d47a1', accentText: '#ffffff', titlebar: '#e9edf2',
  }),
  mk('sunset', '선셋', 'Sunset', 'light', {
    bg: '#fbf4ee', raised: '#ffffff', panel: '#f6ebe2', input: '#ffffff', hover: '#f0dfd2', active: '#e8cfbc', canvas: '#eadfd5',
    border: '#e3d1c4', borderStrong: '#c9ac98', text: '#3a2a22', textDim: '#7a6257', textFaint: '#a48f84',
    accent: '#e0563a', accentStrong: '#b93a22', accentText: '#ffffff', titlebar: '#f2e6dc', shadow: '0 8px 28px rgba(80,40,20,0.18)',
  }),
  mk('solarizedLight', '솔라라이즈드 라이트', 'Solarized Light', 'light', {
    bg: '#fdf6e3', raised: '#fffdf5', panel: '#f5efdc', input: '#fffdf5', hover: '#eee8d5', active: '#e3dcc6', canvas: '#ede6d0',
    border: '#e3dcc6', borderStrong: '#c8c0a8', text: '#586e75', textDim: '#657b83', textFaint: '#93a1a1',
    accent: '#268bd2', accentStrong: '#2aa198', accentText: '#ffffff', titlebar: '#f0e9d6', danger: '#dc322f', dangerBg: '#fbe3e1', warning: '#b58900', ok: '#859900',
  }),
  mk('rose', '로즈', 'Rose', 'light', {
    bg: '#fff5f7', raised: '#ffffff', panel: '#fbe9ee', input: '#ffffff', hover: '#f7dbe3', active: '#f0c9d5', canvas: '#f3dfe5',
    border: '#efd3db', borderStrong: '#d9a9b8', text: '#3d1f2a', textDim: '#7b5462', textFaint: '#a88a95',
    accent: '#d63c6b', accentStrong: '#a8224f', accentText: '#ffffff', titlebar: '#f8e3e9', shadow: '0 8px 28px rgba(120,40,70,0.16)',
  }),
  mk('lavender', '라벤더', 'Lavender', 'light', {
    bg: '#f7f5fc', raised: '#ffffff', panel: '#eeeaf8', input: '#ffffff', hover: '#e4ddf3', active: '#d5cbec', canvas: '#e6e1f1',
    border: '#e0d8f0', borderStrong: '#b8a9dc', text: '#2a2140', textDim: '#5f5478', textFaint: '#918aa8',
    accent: '#7c4dff', accentStrong: '#5e35b1', accentText: '#ffffff', titlebar: '#ebe6f6', shadow: '0 8px 28px rgba(60,40,120,0.16)',
  }),
  mk('mint', '민트', 'Mint', 'light', {
    bg: '#f2faf6', raised: '#ffffff', panel: '#e6f4ec', input: '#ffffff', hover: '#d8ecdf', active: '#c5e2cf', canvas: '#dfece4',
    border: '#d6e8dc', borderStrong: '#9fc7ae', text: '#17322a', textDim: '#4c6d60', textFaint: '#7f9c8f',
    accent: '#0f9d68', accentStrong: '#0b7a50', accentText: '#ffffff', titlebar: '#e2f1e8', shadow: '0 8px 28px rgba(20,80,50,0.16)',
  }),
  mk('paper', '페이퍼', 'Paper', 'light', {
    bg: '#f7f3ea', raised: '#fffdf8', panel: '#efe8da', input: '#fffdf8', hover: '#e7decc', active: '#ddd1ba', canvas: '#e8e0d0',
    border: '#ddd2be', borderStrong: '#b9aa90', text: '#2c261c', textDim: '#6d6456', textFaint: '#9a9080',
    accent: '#8a5a2b', accentStrong: '#6b431c', accentText: '#ffffff', titlebar: '#efe6d6', shadow: '0 8px 28px rgba(80,60,20,0.14)',
  }),
  mk('snow', '스노우', 'Snow', 'light', {
    bg: '#f4f7fb', raised: '#ffffff', panel: '#e8eef6', input: '#ffffff', hover: '#dce6f2', active: '#cddaea', canvas: '#e2e9f2',
    border: '#d2dceb', borderStrong: '#a8b8cc', text: '#1c2836', textDim: '#556678', textFaint: '#8796a8',
    accent: '#1f6feb', accentStrong: '#1248a8', accentText: '#ffffff', titlebar: '#e6eef8',
  }),
  mk('sand', '샌드', 'Sand', 'light', {
    bg: '#f8f1e4', raised: '#fffaf2', panel: '#f0e4d0', input: '#fffaf2', hover: '#e8d7bc', active: '#dcc6a4', canvas: '#eadfcb',
    border: '#e0cfb4', borderStrong: '#c0a67e', text: '#3a2e1e', textDim: '#7a6850', textFaint: '#a89478',
    accent: '#c47b2b', accentStrong: '#9a5c14', accentText: '#ffffff', titlebar: '#f0e4d0', shadow: '0 8px 28px rgba(90,60,20,0.14)',
  }),
  mk('sky', '스카이', 'Sky', 'light', {
    bg: '#f3f9ff', raised: '#ffffff', panel: '#e4f2fc', input: '#ffffff', hover: '#d4e9f8', active: '#c0ddf3', canvas: '#dcecf6',
    border: '#c9e2f2', borderStrong: '#8fc0e0', text: '#163044', textDim: '#4d6e86', textFaint: '#7f9aaf',
    accent: '#0284c7', accentStrong: '#0369a1', accentText: '#ffffff', titlebar: '#e4f2fc',
  }),
  mk('blossom', '블로섬', 'Blossom', 'light', {
    bg: '#fff6fb', raised: '#ffffff', panel: '#fde8f4', input: '#ffffff', hover: '#f8d4ea', active: '#f0bddc', canvas: '#f6e0ee',
    border: '#f3d0e4', borderStrong: '#d99ab8', text: '#3d2034', textDim: '#7d5570', textFaint: '#a88898',
    accent: '#db2777', accentStrong: '#be185d', accentText: '#ffffff', titlebar: '#fde8f4', shadow: '0 8px 28px rgba(120,40,80,0.14)',
  }),
  mk('lemon', '레몬', 'Lemon', 'light', {
    bg: '#fffceb', raised: '#ffffff', panel: '#fbf3cc', input: '#ffffff', hover: '#f4e7a8', active: '#ead67a', canvas: '#f6efd0',
    border: '#eadc9a', borderStrong: '#c9b45a', text: '#3a3210', textDim: '#6e6230', textFaint: '#9a8c58',
    accent: '#a16207', accentStrong: '#854d0e', accentText: '#ffffff', titlebar: '#fbf3cc', shadow: '0 8px 28px rgba(90,80,20,0.14)',
  }),
  mk('fog', '포그', 'Fog', 'light', {
    bg: '#f3f4f6', raised: '#ffffff', panel: '#e7e8ec', input: '#ffffff', hover: '#dcdde3', active: '#cdcfd6', canvas: '#e4e5ea',
    border: '#d4d6dd', borderStrong: '#a8acb8', text: '#22242a', textDim: '#5c606c', textFaint: '#8c909c',
    accent: '#4b5563', accentStrong: '#1f2937', accentText: '#ffffff', titlebar: '#e7e8ec',
  }),
  mk('peach', '피치', 'Peach', 'light', {
    bg: '#fff6f0', raised: '#ffffff', panel: '#ffe8da', input: '#ffffff', hover: '#fad8c4', active: '#f2c4aa', canvas: '#f8e4d8',
    border: '#f0d0be', borderStrong: '#d4a080', text: '#3d2618', textDim: '#7d5a46', textFaint: '#a88874',
    accent: '#ea580c', accentStrong: '#c2410c', accentText: '#ffffff', titlebar: '#ffe8da', shadow: '0 8px 28px rgba(120,60,20,0.14)',
  }),
  mk('sea', '씨', 'Sea', 'light', {
    bg: '#f2fbfb', raised: '#ffffff', panel: '#e2f5f4', input: '#ffffff', hover: '#cfeedc', active: '#b6e4e2', canvas: '#dff0ef',
    border: '#c8e6e4', borderStrong: '#8ec8c4', text: '#143230', textDim: '#4a706c', textFaint: '#7a9c98',
    accent: '#0f766e', accentStrong: '#115e59', accentText: '#ffffff', titlebar: '#e2f5f4',
  }),
  mk('lilac', '라일락', 'Lilac', 'light', {
    bg: '#f8f6ff', raised: '#ffffff', panel: '#eee9fb', input: '#ffffff', hover: '#e0d8f6', active: '#d0c4ee', canvas: '#e8e2f4',
    border: '#ddd4f0', borderStrong: '#b4a4dc', text: '#2a2440', textDim: '#5e5678', textFaint: '#9088a8',
    accent: '#6d28d9', accentStrong: '#5b21b6', accentText: '#ffffff', titlebar: '#eee9fb', shadow: '0 8px 28px rgba(60,40,120,0.14)',
  }),
  mk('cream', '크림', 'Cream', 'light', {
    bg: '#fffaf3', raised: '#ffffff', panel: '#f7efe4', input: '#ffffff', hover: '#efe2d2', active: '#e4d2ba', canvas: '#f3eadf',
    border: '#eadfce', borderStrong: '#cbb89a', text: '#33291c', textDim: '#6e5e4a', textFaint: '#9a8a74',
    accent: '#b45309', accentStrong: '#92400e', accentText: '#ffffff', titlebar: '#f7efe4', shadow: '0 8px 28px rgba(80,60,30,0.14)',
  }),
  mk('matcha', '말차', 'Matcha', 'light', {
    bg: '#f4faf3', raised: '#ffffff', panel: '#e5f3e2', input: '#ffffff', hover: '#d3e8ce', active: '#bddab6', canvas: '#e3f0e0',
    border: '#cfe4ca', borderStrong: '#9cc492', text: '#1c3218', textDim: '#4e6c48', textFaint: '#7c9874',
    accent: '#3f7d32', accentStrong: '#2f6a24', accentText: '#ffffff', titlebar: '#e5f3e2',
  }),
  mk('coral', '코랄', 'Coral', 'light', {
    bg: '#fff5f3', raised: '#ffffff', panel: '#ffe4df', input: '#ffffff', hover: '#fad0c8', active: '#f2b8ae', canvas: '#f8e2dc',
    border: '#f0cfc8', borderStrong: '#d49a90', text: '#3d221c', textDim: '#7d564e', textFaint: '#a88880',
    accent: '#e11d48', accentStrong: '#be123c', accentText: '#ffffff', titlebar: '#ffe4df', shadow: '0 8px 28px rgba(120,40,30,0.14)',
  }),
  mk('porcelain', '포슬린', 'Porcelain', 'light', {
    bg: '#f7f8fa', raised: '#ffffff', panel: '#eef0f4', input: '#ffffff', hover: '#e2e6ee', active: '#d2d8e4', canvas: '#e6e9ef',
    border: '#d8dde6', borderStrong: '#aeb6c6', text: '#1e2430', textDim: '#596274', textFaint: '#8a93a4',
    accent: '#0f62fe', accentStrong: '#0043ce', accentText: '#ffffff', titlebar: '#eef0f4',
  }),
];

export const THEMES = [...DARK, ...LIGHT];

export const DEFAULT_THEME = 'midnight';

export const CUSTOM_COLOR_KEYS = ['bg', 'panel', 'text', 'accent', 'titlebar'];

function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
}

function shift(hexColor, amt) {
  const n = parseInt(String(hexColor).slice(1), 16);
  const ch = (c) => Math.max(0, Math.min(255, c + amt)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Turns a stored custom-theme record into the same shape as a built-in theme. */
export function themeFromCustom(def) {
  const dark = !def || def.mode !== 'light';
  const bg = isHex(def && def.bg) ? def.bg : (dark ? '#12161c' : '#f6f7f9');
  const panel = isHex(def && def.panel) ? def.panel : (dark ? '#161b23' : '#eef1f5');
  const text = isHex(def && def.text) ? def.text : (dark ? '#e4e9f0' : '#1c2530');
  const accent = isHex(def && def.accent) ? def.accent : (dark ? '#4cc9f0' : '#1565c0');
  const titlebar = isHex(def && def.titlebar) ? def.titlebar : (dark ? '#0e1217' : '#e9edf2');
  const name = (def && def.label) || 'Custom';
  return mk(def && def.id ? def.id : 'custom', name, name, dark ? 'dark' : 'light', {
    bg,
    raised: shift(bg, dark ? 12 : 10),
    panel,
    input: shift(bg, dark ? -8 : 8),
    hover: shift(panel, dark ? 16 : -12),
    active: shift(panel, dark ? 28 : -22),
    canvas: shift(bg, dark ? -10 : -12),
    border: shift(panel, dark ? 20 : -18),
    borderStrong: shift(panel, dark ? 40 : -32),
    text,
    textDim: shift(text, dark ? -42 : 48),
    textFaint: shift(text, dark ? -72 : 78),
    accent,
    accentStrong: shift(accent, -28),
    accentText: dark ? '#061018' : '#ffffff',
    titlebar,
  });
}

export function customThemesOf(settings) {
  const list = settings && Array.isArray(settings.customThemes) ? settings.customThemes : [];
  return list.map(themeFromCustom);
}

/** Dark themes, then light themes, then the user's own themes. */
export function themeCycle(customThemes) {
  return [...DARK, ...LIGHT, ...(customThemes || []).map(themeFromCustom)];
}

export function resolveTheme(id, customThemes) {
  const custom = (customThemes || []).find((t) => t && t.id === id);
  if (custom) return themeFromCustom(custom);
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function themeById(id, customThemes) {
  return resolveTheme(id, customThemes);
}

export function nextThemeId(current, customThemes) {
  const list = themeCycle(customThemes);
  const i = list.findIndex((t) => t.id === current);
  return list[(i < 0 ? 0 : i + 1) % list.length].id;
}

export function themeLabel(theme, language) {
  if (!theme) return '';
  return language === 'ko' ? theme.label : theme.labelEn;
}

function paintTheme(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
  return theme;
}

export function applyTheme(id, customThemes) {
  return paintTheme(resolveTheme(id, customThemes));
}

/** Applies an appearance bundle, including a custom theme's token snapshot. */
export function applyAppearanceBundle(appearance) {
  if (!appearance) return null;
  if (appearance.tokens && appearance.theme) {
    return paintTheme({ id: appearance.theme, mode: appearance.mode || 'dark', tokens: appearance.tokens, label: '', labelEn: '' });
  }
  return applyTheme(appearance.theme || DEFAULT_THEME, appearance.customThemes);
}

/** Applies the UI font (family, size, style) chosen in Settings. */
export function applyFont(font) {
  const root = document.documentElement;
  const f = font || {};
  const family = f.family ? `"${String(f.family).replace(/"/g, '')}", ` : '';
  root.style.setProperty('--ui-font', `${family}"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif`);
  root.style.setProperty('--ui-font-size', `${Math.max(9, Number(f.size) || 13)}px`);
  root.style.setProperty('--ui-font-weight', f.bold ? '700' : '400');
  root.style.setProperty('--ui-font-style', f.italic ? 'italic' : 'normal');
}

/** The appearance bundle handed to dialog windows so they match the opener. */
export function appearanceOf(settings) {
  const theme = resolveTheme(settings.theme, settings.customThemes);
  return {
    theme: theme.id,
    mode: theme.mode,
    bg: theme.tokens['--bg'],
    tokens: theme.tokens,
    language: settings.language,
    font: settings.font,
    customThemes: settings.customThemes || [],
  };
}
