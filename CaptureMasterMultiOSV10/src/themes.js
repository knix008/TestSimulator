// Themes: flat token maps applied to :root as CSS custom properties, so every
// surface — main window and dialog windows alike — picks up the same palette.
//
// 16 built-in themes, 10 dark and 6 light. `mk` fills in the derived tokens
// (hover / active / canvas / shadow) from the handful that define a look, so
// adding one is a matter of picking its base, panel, text and accent colours.

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

export const THEMES = [
  mk('midnight', '미드나이트', 'Midnight', 'dark', {
    bg: '#12161c', raised: '#1a2029', panel: '#161b23', input: '#0e1218', hover: '#232b36', active: '#2b3644', canvas: '#0b0e12',
    border: '#2a3441', borderStrong: '#3b4859', text: '#e4e9f0', textDim: '#97a3b4', textFaint: '#6b7789',
    accent: '#4cc9f0', accentStrong: '#4361ee', accentText: '#06202b', titlebar: '#0e1217',
  }),
  mk('daylight', '데이라이트', 'Daylight', 'light', {
    bg: '#f6f7f9', raised: '#ffffff', panel: '#eef1f5', input: '#ffffff', hover: '#e4e9f0', active: '#d6dee9', canvas: '#dfe4ea',
    border: '#d3dae3', borderStrong: '#aab6c5', text: '#1c2530', textDim: '#586372', textFaint: '#8a94a3',
    accent: '#1565c0', accentStrong: '#0d47a1', accentText: '#ffffff', titlebar: '#e9edf2',
  }),
  mk('graphite', '그라파이트', 'Graphite', 'dark', {
    bg: '#1e1e1e', raised: '#262626', panel: '#222222', input: '#171717', hover: '#303030', active: '#3a3a3a', canvas: '#141414',
    border: '#353535', borderStrong: '#4a4a4a', text: '#ececec', textDim: '#a8a8a8', textFaint: '#767676',
    accent: '#ffb347', accentStrong: '#f28c28', accentText: '#1e1200', titlebar: '#181818', danger: '#ff7070', dangerBg: '#3a2020', warning: '#ffd166', ok: '#7ddf8a',
  }),
  mk('ocean', '오션', 'Ocean', 'dark', {
    bg: '#0f1f2a', raised: '#153040', panel: '#122735', input: '#0b1720', hover: '#1d3d50', active: '#254b62', canvas: '#081319',
    border: '#234456', borderStrong: '#33607a', text: '#e2f1f8', textDim: '#9cc0d3', textFaint: '#6a8fa3',
    accent: '#2ee6c5', accentStrong: '#14b8a6', accentText: '#03211c', titlebar: '#0b1922', danger: '#ff7b7b', dangerBg: '#3d1f2a', warning: '#ffd166', ok: '#6ee7b7',
  }),
  mk('forest', '포레스트', 'Forest', 'dark', {
    bg: '#151d17', raised: '#1d2a20', panel: '#19241c', input: '#0f1611', hover: '#26372a', active: '#2f4534', canvas: '#0c120e',
    border: '#2c3f31', borderStrong: '#3f5a46', text: '#e8f0e9', textDim: '#a3b8a7', textFaint: '#748a78',
    accent: '#8be26a', accentStrong: '#4caf50', accentText: '#0b1a08', titlebar: '#101712', danger: '#ff7b7b', dangerBg: '#3d2222', warning: '#ffd166', ok: '#8be26a',
  }),
  mk('sunset', '선셋', 'Sunset', 'light', {
    bg: '#fbf4ee', raised: '#ffffff', panel: '#f6ebe2', input: '#ffffff', hover: '#f0dfd2', active: '#e8cfbc', canvas: '#eadfd5',
    border: '#e3d1c4', borderStrong: '#c9ac98', text: '#3a2a22', textDim: '#7a6257', textFaint: '#a48f84',
    accent: '#e0563a', accentStrong: '#b93a22', accentText: '#ffffff', titlebar: '#f2e6dc', shadow: '0 8px 28px rgba(80,40,20,0.18)',
  }),
  mk('contrast', '고대비', 'High Contrast', 'dark', {
    bg: '#000000', raised: '#0d0d0d', panel: '#080808', input: '#000000', hover: '#1f1f1f', active: '#333333', canvas: '#000000',
    border: '#6f6f6f', borderStrong: '#ffffff', text: '#ffffff', textDim: '#e0e0e0', textFaint: '#b0b0b0',
    accent: '#ffff00', accentStrong: '#ffd600', accentText: '#000000', titlebar: '#000000', danger: '#ff5252', dangerBg: '#3a0000', warning: '#ffab00', ok: '#69f0ae', shadow: '0 0 0 2px #ffffff',
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
  mk('solarizedLight', '솔라라이즈드 라이트', 'Solarized Light', 'light', {
    bg: '#fdf6e3', raised: '#fffdf5', panel: '#f5efdc', input: '#fffdf5', hover: '#eee8d5', active: '#e3dcc6', canvas: '#ede6d0',
    border: '#e3dcc6', borderStrong: '#c8c0a8', text: '#586e75', textDim: '#657b83', textFaint: '#93a1a1',
    accent: '#268bd2', accentStrong: '#2aa198', accentText: '#ffffff', titlebar: '#f0e9d6', danger: '#dc322f', dangerBg: '#fbe3e1', warning: '#b58900', ok: '#859900',
  }),
  mk('monokai', '모노카이', 'Monokai', 'dark', {
    bg: '#272822', raised: '#32332c', panel: '#2c2d26', input: '#1f201b', hover: '#3c3d36', active: '#49483e', canvas: '#1c1d18',
    border: '#3e3f38', borderStrong: '#5b5c52', text: '#f8f8f2', textDim: '#c8c8bf', textFaint: '#90917f',
    accent: '#a6e22e', accentStrong: '#e6db74', accentText: '#1b1f0a', titlebar: '#1f201b', danger: '#f92672', dangerBg: '#4a1e33', warning: '#fd971f', ok: '#a6e22e',
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
  mk('coffee', '커피', 'Coffee', 'dark', {
    bg: '#1f1a17', raised: '#2a2320', panel: '#241e1b', input: '#171310', hover: '#352c27', active: '#41362f', canvas: '#14100e',
    border: '#3a302a', borderStrong: '#55463d', text: '#f1e9e2', textDim: '#bfae9f', textFaint: '#8a7a6d',
    accent: '#e0a458', accentStrong: '#c47f2b', accentText: '#221300', titlebar: '#171310', danger: '#ff7b6b', dangerBg: '#3d221e', warning: '#ffd166', ok: '#9ad27a',
  }),
];

export const DEFAULT_THEME = 'midnight';

export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
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
  const theme = themeById(settings.theme);
  return { theme: theme.id, bg: theme.tokens['--bg'], language: settings.language, font: settings.font };
}
