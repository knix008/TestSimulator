// 30 built-in themes (15 dark, 15 light) —
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
  mk('cherry', '체리', 'Cherry', 'dark', {
    bg: '#1c1216', raised: '#28191f', panel: '#22161b', hover: '#34212a', active: '#412a35',
    border: '#3b2530', borderStrong: '#5a3747', text: '#f6e7ec', textDim: '#c49aab',
    accent: '#ff5c8a', accentStrong: '#e0245e', accentText: '#2b0410', danger: '#ff8c7a', folder: '#ff9db8', file: '#d9b3c0',
  }),
  mk('cyber', '사이버', 'Cyber', 'dark', {
    bg: '#0b0b12', raised: '#14121f', panel: '#100f1a', hover: '#1d1a2e', active: '#27233c',
    border: '#252238', borderStrong: '#3d3860', text: '#eae6ff', textDim: '#9d94c9',
    accent: '#ff2fd6', accentStrong: '#c400a8', accentText: '#2a0022', danger: '#ff6b6b', folder: '#7cf9ff', file: '#b9b0e6',
  }),
  mk('arctic', '아틱', 'Arctic', 'light', {
    bg: '#f2f8fc', raised: '#ffffff', panel: '#e9f2f9', hover: '#dbe9f3', active: '#c9dcea',
    border: '#cfdfeb', borderStrong: '#a3bfd3', text: '#122433', textDim: '#4f6d82',
    accent: '#0aa2c0', accentStrong: '#0b7f96', accentText: '#ffffff', danger: '#d9484f', folder: '#2c9fd8', file: '#6f8ea6',
  }),
  mk('sand', '샌드', 'Sand', 'light', {
    bg: '#f8f2e6', raised: '#fffaf1', panel: '#f1e8d8', hover: '#e8dcc6', active: '#dccbb0',
    border: '#dccfb9', borderStrong: '#bfa98a', text: '#33271a', textDim: '#7d6a52',
    accent: '#b45f06', accentStrong: '#8a4604', accentText: '#ffffff', danger: '#c8432f', folder: '#c98a2e', file: '#9a866c',
  }),
  mk('gruvbox', '그루브박스', 'Gruvbox', 'dark', {
    bg: '#1d2021', raised: '#32302f', panel: '#282828', hover: '#3c3836', active: '#504945',
    border: '#3c3836', borderStrong: '#665c54', text: '#ebdbb2', textDim: '#bdae93',
    accent: '#fabd2f', accentStrong: '#fe8019', accentText: '#1d2021', danger: '#fb4934', folder: '#fabd2f', file: '#83a598',
  }),
  mk('oneDark', '원 다크', 'One Dark', 'dark', {
    bg: '#21252b', raised: '#2c313a', panel: '#282c34', hover: '#333842', active: '#3e4451',
    border: '#3a3f4b', borderStrong: '#545b68', text: '#abb2bf', textDim: '#8b929e',
    accent: '#61afef', accentStrong: '#c678dd', accentText: '#0e1a26', danger: '#e06c75', folder: '#e5c07b', file: '#98c379',
  }),
  mk('tokyoNight', '도쿄 나이트', 'Tokyo Night', 'dark', {
    bg: '#16161e', raised: '#24283b', panel: '#1a1b26', hover: '#292e42', active: '#33384f',
    border: '#292e42', borderStrong: '#414868', text: '#c0caf5', textDim: '#8f9ac0',
    accent: '#7aa2f7', accentStrong: '#bb9af7', accentText: '#0f1424', danger: '#f7768e', folder: '#e0af68', file: '#7dcfff',
  }),
  mk('paper', '페이퍼', 'Paper', 'light', {
    bg: '#fafafa', raised: '#ffffff', panel: '#f1f1f1', hover: '#e6e6e6', active: '#d9d9d9',
    border: '#dcdcdc', borderStrong: '#b5b5b5', text: '#212121', textDim: '#616161',
    accent: '#455a64', accentStrong: '#263238', accentText: '#ffffff', danger: '#c62828', folder: '#d19a1d', file: '#757575',
  }),
  mk('lemon', '레몬', 'Lemon', 'light', {
    bg: '#fffbe6', raised: '#fffef7', panel: '#fff6cc', hover: '#fdefb0', active: '#f7e48f',
    border: '#efe3a8', borderStrong: '#d4c46a', text: '#3d3300', textDim: '#7a6d2a',
    accent: '#c79100', accentStrong: '#9a6f00', accentText: '#ffffff', danger: '#c8432f', folder: '#d9a300', file: '#9c8f5a',
  }),
  mk('sky', '스카이', 'Sky', 'light', {
    bg: '#eef6ff', raised: '#ffffff', panel: '#e2efff', hover: '#d2e5fc', active: '#bcd7f7',
    border: '#cfe0f4', borderStrong: '#96bce4', text: '#10253d', textDim: '#4b6786',
    accent: '#2f80ed', accentStrong: '#1c5fbf', accentText: '#ffffff', danger: '#d9484f', folder: '#f2a83b', file: '#6f8fb5',
  }),
  mk('peach', '피치', 'Peach', 'light', {
    bg: '#fff3ec', raised: '#fffaf7', panel: '#ffe8da', hover: '#fddac6', active: '#f9c9ad',
    border: '#f3d6c4', borderStrong: '#dcab8e', text: '#3f2418', textDim: '#84584a',
    accent: '#ff7a45', accentStrong: '#e05a2b', accentText: '#ffffff', shadow: '0 10px 30px rgba(120,60,30,0.16)', folder: '#f0a03c', file: '#b08670',
  }),
  mk('olive', '올리브', 'Olive', 'light', {
    bg: '#f6f7ef', raised: '#fdfdf8', panel: '#edf0e0', hover: '#e2e7cf', active: '#d3dbb8',
    border: '#dde2c8', borderStrong: '#b3bd8e', text: '#26301a', textDim: '#5d6a47',
    accent: '#6b8e23', accentStrong: '#4f6b1a', accentText: '#ffffff', danger: '#c8432f', folder: '#c9a227', file: '#7f8f62',
  }),
  mk('slate', '슬레이트', 'Slate', 'light', {
    bg: '#eef0f3', raised: '#f8f9fb', panel: '#e4e7ec', hover: '#d8dce4', active: '#c8ced9',
    border: '#d2d7df', borderStrong: '#a4adbb', text: '#1f2633', textDim: '#5a6577',
    accent: '#5c6bc0', accentStrong: '#3949ab', accentText: '#ffffff', danger: '#c62828', folder: '#e0a92a', file: '#7b86a0',
  }),
  mk('plum', '플럼', 'Plum', 'light', {
    bg: '#f9f2f8', raised: '#fefbfe', panel: '#f2e6f0', hover: '#ead8e7', active: '#dfc5db',
    border: '#e6d5e3', borderStrong: '#c4a3bf', text: '#341c30', textDim: '#6e5169',
    accent: '#8e24aa', accentStrong: '#6a1b9a', accentText: '#ffffff', shadow: '0 10px 30px rgba(90,30,80,0.16)', folder: '#e0a92a', file: '#9c7d98',
  }),
];

export const DEFAULT_THEME = 'midnight';

// ── Custom themes ─────────────────────────────────────────
// Made in settings › theme from any built-in one and kept in the session as
// { id: 'custom-…', label, mode, colors } (the base colours `mk` takes).
// setCustomThemes() registers them so every lookup (picker, cycling, apply)
// sees built-in and custom themes alike.
export const CUSTOM_COLOR_KEYS = ['bg', 'panel', 'raised', 'hover', 'active', 'border', 'borderStrong', 'text', 'textDim', 'accent', 'accentStrong', 'accentText', 'folder', 'file', 'danger'];
let customThemes = [];
let customThemesRaw = [];
export function setCustomThemes(list) {
  customThemesRaw = Array.isArray(list) ? list : [];
  customThemes = customThemesRaw.filter((c) => c && c.id && c.colors).map((c) => ({ ...mk(c.id, c.label || 'Custom', c.label || 'Custom', c.mode === 'light' ? 'light' : 'dark', c.colors), custom: true }));
}
export function getCustomThemes() { return customThemes; }
// The list as it came in ({ id, label, mode, colors }) — what another window needs to show the same themes.
export function getCustomThemesRaw() { return customThemesRaw; }
export function allThemes() { return [...THEMES, ...customThemes]; }
// The base colours of a theme (built-in ones are reconstructed from their tokens) — the starting point of a new custom theme.
export function baseColorsOf(theme) {
  const tk = theme.tokens;
  return { bg: tk['--bg'], panel: tk['--bg-panel'], raised: tk['--bg-elev'], hover: tk['--bg-hover'], active: tk['--bg-sel-inactive'], border: tk['--border'], borderStrong: tk['--border-strong'], text: tk['--fg'], textDim: tk['--fg-muted'], accent: tk['--accent'], accentStrong: tk['--accent-strong'], accentText: tk['--accent-text'], folder: tk['--folder'], file: tk['--file'], danger: tk['--danger'] };
}

export function themeById(id) {
  return allThemes().find((th) => th.id === id) || THEMES[0];
}

export function nextThemeId(id) {
  const all = allThemes();
  const i = all.findIndex((th) => th.id === id);
  return all[(i + 1) % all.length].id;
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
