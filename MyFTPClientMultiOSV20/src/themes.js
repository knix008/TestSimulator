// 16 built-in themes (10 dark, 6 light) — the same set as the sibling apps —
// applied as CSS custom properties on :root. `mk` derives the secondary
// tokens (selection, active-panel glow, shadow) from the few that define a
// look, so a theme is just its base colours.

function mk(id, label, labelEn, mode, c) {
  const dark = mode === 'dark';
  const accent = c.accent;
  return {
    id, label, labelEn, mode,
    tokens: {
      '--bg': c.bg,
      '--bg-panel': c.panel,
      '--bg-elev': c.raised,
      '--bg-hover': c.hover,
      '--bg-sel': c.sel || (dark ? `color-mix(in srgb, ${accent} 32%, ${c.panel})` : `color-mix(in srgb, ${accent} 22%, ${c.panel})`),
      '--bg-sel-inactive': c.active,
      '--fg': c.text,
      '--fg-muted': c.textDim,
      '--border': c.border,
      '--border-strong': c.borderStrong,
      '--accent': accent,
      '--accent-strong': c.accentStrong,
      '--accent-text': c.accentText || (dark ? '#0b1220' : '#ffffff'),
      '--danger': c.danger || (dark ? '#ff6b6b' : '#c62828'),
      '--folder': c.folder || (dark ? '#f5c451' : '#e0a92a'),
      '--file': c.file || c.textDim,
      '--ok': c.ok || (dark ? '#4ade80' : '#2e7d32'),
      '--shadow': c.shadow || (dark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(20,30,50,0.18)'),
      '--active-border': `color-mix(in srgb, ${accent} 75%, transparent)`,
      '--active-glow': `0 0 0 1px color-mix(in srgb, ${accent} 35%, transparent)`,
    },
  };
}

export const THEMES = [
  mk('midnight', '미드나이트', 'Midnight', 'dark', {
    bg: '#12161c', raised: '#1a2029', panel: '#161b23', hover: '#232b36', active: '#2b3644',
    border: '#2a3441', borderStrong: '#3b4859', text: '#e4e9f0', textDim: '#97a3b4',
    accent: '#4cc9f0', accentStrong: '#4361ee', accentText: '#06202b', file: '#9fb3d9',
  }),
  mk('daylight', '데이라이트', 'Daylight', 'light', {
    bg: '#f6f7f9', raised: '#ffffff', panel: '#eef1f5', hover: '#e4e9f0', active: '#d6dee9',
    border: '#d3dae3', borderStrong: '#aab6c5', text: '#1c2530', textDim: '#586372',
    accent: '#1565c0', accentStrong: '#0d47a1', accentText: '#ffffff', file: '#6b82ad',
  }),
  mk('graphite', '그라파이트', 'Graphite', 'dark', {
    bg: '#1e1e1e', raised: '#262626', panel: '#222222', hover: '#303030', active: '#3a3a3a',
    border: '#353535', borderStrong: '#4a4a4a', text: '#ececec', textDim: '#a8a8a8',
    accent: '#ffb347', accentStrong: '#f28c28', accentText: '#1e1200', danger: '#ff7070', folder: '#ffb347', file: '#bdbdbd',
  }),
  mk('ocean', '오션', 'Ocean', 'dark', {
    bg: '#0f1f2a', raised: '#153040', panel: '#122735', hover: '#1d3d50', active: '#254b62',
    border: '#234456', borderStrong: '#33607a', text: '#e2f1f8', textDim: '#9cc0d3',
    accent: '#2ee6c5', accentStrong: '#14b8a6', accentText: '#03211c', danger: '#ff7b7b', file: '#8fc4dc',
  }),
  mk('forest', '포레스트', 'Forest', 'dark', {
    bg: '#151d17', raised: '#1d2a20', panel: '#19241c', hover: '#26372a', active: '#2f4534',
    border: '#2c3f31', borderStrong: '#3f5a46', text: '#e8f0e9', textDim: '#a3b8a7',
    accent: '#8be26a', accentStrong: '#4caf50', accentText: '#0b1a08', danger: '#ff7b7b', file: '#a9c9ad',
  }),
  mk('sunset', '선셋', 'Sunset', 'light', {
    bg: '#fbf4ee', raised: '#ffffff', panel: '#f6ebe2', hover: '#f0dfd2', active: '#e8cfbc',
    border: '#e3d1c4', borderStrong: '#c9ac98', text: '#3a2a22', textDim: '#7a6257',
    accent: '#e0563a', accentStrong: '#b93a22', accentText: '#ffffff', shadow: '0 10px 30px rgba(80,40,20,0.18)', file: '#a07c6b',
  }),
  mk('contrast', '고대비', 'High Contrast', 'dark', {
    bg: '#000000', raised: '#0d0d0d', panel: '#080808', hover: '#1f1f1f', active: '#333333',
    border: '#6f6f6f', borderStrong: '#ffffff', text: '#ffffff', textDim: '#e0e0e0',
    accent: '#ffff00', accentStrong: '#ffd600', accentText: '#000000', danger: '#ff5252', folder: '#ffff00', file: '#ffffff',
    sel: '#3a3a00', shadow: '0 0 0 2px #ffffff',
  }),
  mk('nord', '노르드', 'Nord', 'dark', {
    bg: '#2e3440', raised: '#3b4252', panel: '#343b4a', hover: '#434c5e', active: '#4c566a',
    border: '#434c5e', borderStrong: '#5b667a', text: '#eceff4', textDim: '#d8dee9',
    accent: '#88c0d0', accentStrong: '#5e81ac', accentText: '#1b2430', danger: '#bf616a', folder: '#ebcb8b', file: '#b8c5d6',
  }),
  mk('dracula', '드라큘라', 'Dracula', 'dark', {
    bg: '#282a36', raised: '#343746', panel: '#2d2f3d', hover: '#3d4052', active: '#44475a',
    border: '#44475a', borderStrong: '#6272a4', text: '#f8f8f2', textDim: '#bfc2d0',
    accent: '#bd93f9', accentStrong: '#ff79c6', accentText: '#1a1023', danger: '#ff5555', folder: '#f1fa8c', file: '#8be9fd',
  }),
  mk('solarizedDark', '솔라라이즈드 다크', 'Solarized Dark', 'dark', {
    bg: '#002b36', raised: '#073642', panel: '#03303c', hover: '#0d4452', active: '#175261',
    border: '#0d4452', borderStrong: '#2a6b7c', text: '#eee8d5', textDim: '#93a1a1',
    accent: '#2aa198', accentStrong: '#268bd2', accentText: '#00201c', danger: '#dc322f', folder: '#b58900', file: '#93a1a1',
  }),
  mk('solarizedLight', '솔라라이즈드 라이트', 'Solarized Light', 'light', {
    bg: '#fdf6e3', raised: '#fffdf5', panel: '#f5efdc', hover: '#eee8d5', active: '#e3dcc6',
    border: '#e3dcc6', borderStrong: '#c8c0a8', text: '#586e75', textDim: '#657b83',
    accent: '#268bd2', accentStrong: '#2aa198', accentText: '#ffffff', danger: '#dc322f', folder: '#b58900', file: '#839496',
  }),
  mk('monokai', '모노카이', 'Monokai', 'dark', {
    bg: '#272822', raised: '#32332c', panel: '#2c2d26', hover: '#3c3d36', active: '#49483e',
    border: '#3e3f38', borderStrong: '#5b5c52', text: '#f8f8f2', textDim: '#c8c8bf',
    accent: '#a6e22e', accentStrong: '#e6db74', accentText: '#1b1f0a', danger: '#f92672', folder: '#e6db74', file: '#66d9ef',
  }),
  mk('rose', '로즈', 'Rose', 'light', {
    bg: '#fff5f7', raised: '#ffffff', panel: '#fbe9ee', hover: '#f7dbe3', active: '#f0c9d5',
    border: '#efd3db', borderStrong: '#d9a9b8', text: '#3d1f2a', textDim: '#7b5462',
    accent: '#d63c6b', accentStrong: '#a8224f', accentText: '#ffffff', shadow: '0 10px 30px rgba(120,40,70,0.16)', file: '#a3778a',
  }),
  mk('lavender', '라벤더', 'Lavender', 'light', {
    bg: '#f7f5fc', raised: '#ffffff', panel: '#eeeaf8', hover: '#e4ddf3', active: '#d5cbec',
    border: '#e0d8f0', borderStrong: '#b8a9dc', text: '#2a2140', textDim: '#5f5478',
    accent: '#7c4dff', accentStrong: '#5e35b1', accentText: '#ffffff', shadow: '0 10px 30px rgba(60,40,120,0.16)', file: '#8b7fb0',
  }),
  mk('mint', '민트', 'Mint', 'light', {
    bg: '#f2faf6', raised: '#ffffff', panel: '#e6f4ec', hover: '#d8ecdf', active: '#c5e2cf',
    border: '#d6e8dc', borderStrong: '#9fc7ae', text: '#17322a', textDim: '#4c6d60',
    accent: '#0f9d68', accentStrong: '#0b7a50', accentText: '#ffffff', shadow: '0 10px 30px rgba(20,80,50,0.16)', file: '#6f9a86',
  }),
  mk('coffee', '커피', 'Coffee', 'dark', {
    bg: '#1f1a17', raised: '#2a2320', panel: '#241e1b', hover: '#352c27', active: '#41362f',
    border: '#3a302a', borderStrong: '#55463d', text: '#f1e9e2', textDim: '#bfae9f',
    accent: '#e0a458', accentStrong: '#c47f2b', accentText: '#221300', danger: '#ff7b6b', folder: '#e0a458', file: '#c9b5a2',
  }),
];

export const DEFAULT_THEME = 'midnight';

export function themeSwatchStyle(th) {
  const t = (th && th.tokens) || {};
  return { background: `linear-gradient(135deg, ${t['--bg'] || '#888'} 50%, ${t['--accent'] || '#888'} 50%)` };
}

export function themeById(id) {
  return THEMES.find((th) => th.id === id) || THEMES[0];
}

export function nextThemeId(id) {
  const i = THEMES.findIndex((th) => th.id === id);
  return THEMES[(i + 1) % THEMES.length].id;
}

export function applyTheme(id) {
  const theme = themeById(id);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.tokens)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
  return theme;
}
