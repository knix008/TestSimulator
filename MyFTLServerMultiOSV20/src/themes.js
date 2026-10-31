// 40 built-in themes (20 dark, 20 light — the same set as the sibling apps)
// applied as CSS custom properties on :root. `mk` derives the secondary tokens (selection, active-panel glow,
// shadow) from the few that define a look, so a theme is just its base
// colours. Custom themes (Settings › 테마) are made of the same base
// colours and registered with setCustomThemes().

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
  mk('paper', '페이퍼', 'Paper', 'light', {
    bg: '#fafaf7', raised: '#ffffff', panel: '#f1f0ea', hover: '#e8e6dd', active: '#dcd9cc',
    border: '#e0ddd2', borderStrong: '#bdb8a8', text: '#26241e', textDim: '#66625a',
    accent: '#3d6fd8', accentStrong: '#2852ad', accentText: '#ffffff', file: '#827d70',
  }),
  mk('sky', '스카이', 'Sky', 'light', {
    bg: '#f2f8fd', raised: '#ffffff', panel: '#e5f0fa', hover: '#d6e7f6', active: '#c2dbf0',
    border: '#d0e2f2', borderStrong: '#9cc0e0', text: '#132a40', textDim: '#4b6680',
    accent: '#0284c7', accentStrong: '#0369a1', accentText: '#ffffff', shadow: '0 10px 30px rgba(20,60,110,0.16)', file: '#6f8fae',
  }),
  mk('sand', '샌드', 'Sand', 'light', {
    bg: '#fbf7ef', raised: '#fffdf8', panel: '#f4ecdc', hover: '#ece0c9', active: '#e2d2b4',
    border: '#e6dac2', borderStrong: '#c9b48c', text: '#3b2f1a', textDim: '#76664a',
    accent: '#b7791f', accentStrong: '#8a5a12', accentText: '#ffffff', shadow: '0 10px 30px rgba(90,60,20,0.16)', file: '#9a8763',
  }),
  mk('arctic', '아크틱', 'Arctic', 'light', {
    bg: '#f5f7fa', raised: '#ffffff', panel: '#eceff4', hover: '#e1e6ee', active: '#d1d9e6',
    border: '#d8dee9', borderStrong: '#a7b3c6', text: '#2e3440', textDim: '#5d6779',
    accent: '#5e81ac', accentStrong: '#4c6a91', accentText: '#ffffff', danger: '#bf616a', folder: '#d08770', file: '#7b88a1',
  }),
  mk('cherry', '체리', 'Cherry', 'dark', {
    bg: '#1c1216', raised: '#271a20', panel: '#21161b', hover: '#33222a', active: '#402b35',
    border: '#3b2530', borderStrong: '#5a3747', text: '#f6e7ec', textDim: '#c49aab',
    accent: '#ff5c8a', accentStrong: '#e0245e', accentText: '#2b0410', danger: '#ff8c7a', folder: '#ff9db8', file: '#d9b3c0',
  }),
  mk('cyber', '사이버', 'Cyber', 'dark', {
    bg: '#0b0b12', raised: '#14121f', panel: '#100f1a', hover: '#1d1a2e', active: '#27233c',
    border: '#252238', borderStrong: '#3d3860', text: '#eae6ff', textDim: '#9d94c9',
    accent: '#ff2fd6', accentStrong: '#c400a8', accentText: '#2a0022', danger: '#ff6b6b', folder: '#7cf9ff', file: '#b9b0e6',
  }),
  mk('gruvboxDark', '그루브박스 다크', 'Gruvbox Dark', 'dark', {
    bg: '#282828', raised: '#3c3836', panel: '#32302f', hover: '#504945', active: '#665c54',
    border: '#3c3836', borderStrong: '#665c54', text: '#ebdbb2', textDim: '#a89984',
    accent: '#fabd2f', accentStrong: '#d79921', accentText: '#282828', danger: '#fb4934', folder: '#fabd2f', file: '#83a598',
  }),
  mk('oneDark', '원 다크', 'One Dark', 'dark', {
    bg: '#282c34', raised: '#31353f', panel: '#21252b', hover: '#3a3f4b', active: '#3e4451',
    border: '#3a3f4b', borderStrong: '#4b5263', text: '#abb2bf', textDim: '#7f848e',
    accent: '#61afef', accentStrong: '#528bff', accentText: '#0b1220', danger: '#e06c75', folder: '#e5c07b', file: '#61afef',
  }),
  mk('tokyoNight', '도쿄 나이트', 'Tokyo Night', 'dark', {
    bg: '#1a1b26', raised: '#24283b', panel: '#1f2335', hover: '#2f334d', active: '#364a82',
    border: '#2a2f41', borderStrong: '#3b4261', text: '#c0caf5', textDim: '#9aa5ce',
    accent: '#7aa2f7', accentStrong: '#bb9af7', accentText: '#0b1020', danger: '#f7768e', folder: '#e0af68', file: '#7dcfff',
  }),
  mk('githubDark', '깃허브 다크', 'GitHub Dark', 'dark', {
    bg: '#0d1117', raised: '#161b22', panel: '#11161d', hover: '#1f2630', active: '#263040',
    border: '#30363d', borderStrong: '#484f58', text: '#e6edf3', textDim: '#8b949e',
    accent: '#58a6ff', accentStrong: '#1f6feb', accentText: '#04121f', danger: '#f85149', folder: '#e3b341', file: '#79c0ff',
  }),
  mk('catppuccin', '카푸친 모카', 'Catppuccin Mocha', 'dark', {
    bg: '#1e1e2e', raised: '#313244', panel: '#181825', hover: '#45475a', active: '#585b70',
    border: '#313244', borderStrong: '#585b70', text: '#cdd6f4', textDim: '#a6adc8',
    accent: '#89b4fa', accentStrong: '#cba6f7', accentText: '#11111b', danger: '#f38ba8', folder: '#f9e2af', file: '#89dceb',
  }),
  mk('slate', '슬레이트', 'Slate', 'dark', {
    bg: '#171b21', raised: '#1f242c', panel: '#1b2027', hover: '#272e38', active: '#313a46',
    border: '#2a323c', borderStrong: '#3e4a58', text: '#dfe6ee', textDim: '#93a0b0',
    accent: '#7dd3fc', accentStrong: '#38bdf8', accentText: '#062030', danger: '#fb7185', folder: '#fcd34d', file: '#9fb3c8',
  }),
  mk('abyss', '어비스', 'Abyss', 'dark', {
    bg: '#060b1a', raised: '#0f1630', panel: '#0a1024', hover: '#182141', active: '#222d55',
    border: '#1b2446', borderStrong: '#2d3a6b', text: '#dce4ff', textDim: '#8d98c7',
    accent: '#4d7cff', accentStrong: '#2b55e0', accentText: '#eaf0ff', danger: '#ff6b81', folder: '#ffd166', file: '#8fb2ff',
  }),
  mk('matrix', '매트릭스', 'Matrix', 'dark', {
    bg: '#050a06', raised: '#0d1a0f', panel: '#08120a', hover: '#142816', active: '#1c3a1f',
    border: '#16301a', borderStrong: '#245c2b', text: '#c8f7c5', textDim: '#6fbf73',
    accent: '#39ff14', accentStrong: '#00c853', accentText: '#021405', danger: '#ff5252', folder: '#39ff14', file: '#8ce99a',
  }),
  mk('githubLight', '깃허브 라이트', 'GitHub Light', 'light', {
    bg: '#ffffff', raised: '#ffffff', panel: '#f6f8fa', hover: '#eaeef2', active: '#ddf4ff',
    border: '#d0d7de', borderStrong: '#afb8c1', text: '#1f2328', textDim: '#656d76',
    accent: '#0969da', accentStrong: '#0550ae', accentText: '#ffffff', danger: '#cf222e', folder: '#dbab0a', file: '#57606a',
  }),
  mk('gruvboxLight', '그루브박스 라이트', 'Gruvbox Light', 'light', {
    bg: '#fbf1c7', raised: '#fffbea', panel: '#f2e5bc', hover: '#ebdbb2', active: '#d5c4a1',
    border: '#ddcca7', borderStrong: '#bdae93', text: '#3c3836', textDim: '#665c54',
    accent: '#af3a03', accentStrong: '#9d0006', accentText: '#ffffff', danger: '#9d0006', folder: '#b57614', file: '#076678',
    shadow: '0 10px 30px rgba(90,70,20,0.18)',
  }),
  mk('oneLight', '원 라이트', 'One Light', 'light', {
    bg: '#fafafa', raised: '#ffffff', panel: '#f0f0f1', hover: '#e8e8e9', active: '#d7dae0',
    border: '#dcdcdd', borderStrong: '#b8b9bb', text: '#383a42', textDim: '#696c77',
    accent: '#4078f2', accentStrong: '#2b5fd9', accentText: '#ffffff', danger: '#e45649', folder: '#c18401', file: '#0184bc',
  }),
  mk('latte', '카푸친 라테', 'Catppuccin Latte', 'light', {
    bg: '#eff1f5', raised: '#ffffff', panel: '#e6e9ef', hover: '#dce0e8', active: '#ccd0da',
    border: '#dce0e8', borderStrong: '#9ca0b0', text: '#4c4f69', textDim: '#6c6f85',
    accent: '#1e66f5', accentStrong: '#8839ef', accentText: '#ffffff', danger: '#d20f39', folder: '#df8e1d', file: '#209fb5',
  }),
  mk('meadow', '메도우', 'Meadow', 'light', {
    bg: '#f5fbf2', raised: '#ffffff', panel: '#e9f5e4', hover: '#dbecd3', active: '#c7e0bd',
    border: '#d7e9d0', borderStrong: '#a3c799', text: '#1b3317', textDim: '#4f6d48',
    accent: '#3f8f29', accentStrong: '#2c6b1a', accentText: '#ffffff', danger: '#c0392b', folder: '#8aa32c', file: '#6f9a66',
  }),
  mk('apricot', '애프리콧', 'Apricot', 'light', {
    bg: '#fff8f1', raised: '#ffffff', panel: '#ffeedd', hover: '#ffe1c7', active: '#fbd0a9',
    border: '#f7dcc3', borderStrong: '#e0b183', text: '#3c2a16', textDim: '#7c5c3a',
    accent: '#e07a1f', accentStrong: '#b85c0b', accentText: '#ffffff', danger: '#c0392b', folder: '#e0a020', file: '#a3845f',
    shadow: '0 10px 30px rgba(110,60,20,0.16)',
  }),
  mk('ash', '애시', 'Ash', 'light', {
    bg: '#f4f5f6', raised: '#ffffff', panel: '#eaebed', hover: '#dfe1e4', active: '#ced1d6',
    border: '#d8dadd', borderStrong: '#b0b4b9', text: '#22262b', textDim: '#5c6269',
    accent: '#546e7a', accentStrong: '#37474f', accentText: '#ffffff', danger: '#b3261e', folder: '#b08a3a', file: '#7a8288',
  }),
  mk('contrastLight', '고대비 밝은', 'Contrast Light', 'light', {
    bg: '#ffffff', raised: '#ffffff', panel: '#f2f2f2', hover: '#e0e0e0', active: '#cfe0ff',
    border: '#767676', borderStrong: '#000000', text: '#000000', textDim: '#1a1a1a',
    accent: '#0b00c8', accentStrong: '#000080', accentText: '#ffffff', danger: '#b00000', folder: '#7a4b00', file: '#000000',
    sel: '#cfe0ff', shadow: '0 0 0 2px #000000',
  }),
  mk('cocoa', '코코아', 'Cocoa', 'light', {
    bg: '#faf4ef', raised: '#fffaf6', panel: '#f1e6dd', hover: '#e6d6ca', active: '#d8c3b2',
    border: '#e0cfc2', borderStrong: '#bda38f', text: '#3a2b21', textDim: '#75594a',
    accent: '#8d5524', accentStrong: '#6b3d14', accentText: '#ffffff', danger: '#b23a2f', folder: '#b5822f', file: '#9a7a66',
    shadow: '0 10px 30px rgba(80,50,30,0.16)',
  }),
  mk('lemon', '레몬', 'Lemon', 'light', {
    bg: '#fffdf0', raised: '#ffffff', panel: '#fcf6d9', hover: '#f7eec0', active: '#eedfa0',
    border: '#f0e4b5', borderStrong: '#cfbb73', text: '#33300f', textDim: '#6e6730',
    accent: '#8a7a00', accentStrong: '#6b5e00', accentText: '#ffffff', danger: '#b3261e', folder: '#c9a227', file: '#8d8a5a',
    shadow: '0 10px 30px rgba(90,80,20,0.16)',
  }),
];

// Dark first, then light: cycling with the toolbar button walks one mode at a time.
THEMES.sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'dark' ? -1 : 1));

export const DEFAULT_THEME = 'midnight';

// ── Custom themes ─────────────────────────────────────────
// Kept in the session as { id: 'custom-…', label, mode, colors } (the base
// colours `mk` takes). setCustomThemes() registers them so every lookup
// (picker, cycling, apply) sees built-in and custom alike.
export const CUSTOM_COLOR_KEYS = ['bg', 'panel', 'raised', 'hover', 'active', 'border', 'borderStrong', 'text', 'textDim', 'accent', 'accentStrong', 'accentText', 'folder', 'file', 'danger'];
let customThemes = [];
/** The theme object of a stored custom theme. */
export function buildCustomTheme(c) {
  return { ...mk(c.id, c.label || 'Custom', c.label || 'Custom', c.mode === 'light' ? 'light' : 'dark', c.colors), custom: true };
}
export function setCustomThemes(list) {
  customThemes = (Array.isArray(list) ? list : []).filter((c) => c && c.id && c.colors).map(buildCustomTheme);
}
export function getCustomThemes() { return customThemes; }
export function allThemes() { return [...customThemes, ...THEMES]; }
/** The base colours of a theme (built-in ones rebuilt from their tokens): the start of a new custom theme. */
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
