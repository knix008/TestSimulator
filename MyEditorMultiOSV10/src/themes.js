// 40 built-in themes (20 dark, 20 light) — the same set as the sibling apps —
// applied as CSS custom properties on :root. `mk` derives the secondary
// tokens (selection, active-panel glow, shadow) from the few that define a
// look, so a theme is just its base colours. Custom themes (settings › theme)
// are made of the same base colours and registered with setCustomThemes().
//
// Each theme also carries a syntax palette (--syn-*), read by the CodeMirror
// highlight style in src/lib/editor.js. Themes named after a well-known
// editor scheme (Monokai, Dracula, Nord, Solarized…) use that scheme's
// colours; the others get a generic dark / light palette.

const SYN_DARK = { keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', comment: '#7a8794', function: '#82aaff', type: '#ffcb6b', variable: '#e4e9f0', property: '#80cbc4', operator: '#89ddff', bracket: '#c9d1d9', tag: '#f07178', meta: '#b2ccd6', regexp: '#f78c6c', heading: '#82aaff', link: '#4cc9f0', constant: '#ff9cac' };
const SYN_LIGHT = { keyword: '#7c3aed', string: '#15803d', number: '#c2410c', comment: '#7b8794', function: '#1d4ed8', type: '#b45309', variable: '#1c2530', property: '#0f766e', operator: '#475569', bracket: '#334155', tag: '#be123c', meta: '#6b7280', regexp: '#c2410c', heading: '#1d4ed8', link: '#1565c0', constant: '#9d174d' };

function mk(id, label, labelEn, mode, c, syn) {
  const dark = mode === 'dark';
  const accent = c.accent;
  const s = { ...(dark ? SYN_DARK : SYN_LIGHT), ...(syn || {}) };
  return {
    id, label, labelEn, mode,
    tokens: {
      ...Object.fromEntries(Object.entries(s).map(([k, v]) => [`--syn-${k}`, v])),
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
  }, { keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955', function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', property: '#9cdcfe', operator: '#d4d4d4', bracket: '#ffd700', tag: '#569cd6', meta: '#c586c0', regexp: '#d16969', heading: '#569cd6', link: '#4fc1ff', constant: '#4fc1ff' }),
  mk('ocean', '오션', 'Ocean', 'dark', {
    bg: '#0f1f2a', raised: '#153040', panel: '#122735', hover: '#1d3d50', active: '#254b62',
    border: '#234456', borderStrong: '#33607a', text: '#e2f1f8', textDim: '#9cc0d3',
    accent: '#2ee6c5', accentStrong: '#14b8a6', accentText: '#03211c', danger: '#ff7b7b', file: '#8fc4dc',
  }, { keyword: '#c792ea', string: '#8be9a8', number: '#f7a56c', comment: '#6f93a8', function: '#5ed7ff', type: '#ffd580', variable: '#e2f1f8', property: '#2ee6c5', operator: '#89ddff', bracket: '#cfe8f3', tag: '#ff8b8b', meta: '#9cc0d3', regexp: '#f7a56c', heading: '#5ed7ff', link: '#2ee6c5', constant: '#ffb3c6' }),
  mk('forest', '포레스트', 'Forest', 'dark', {
    bg: '#151d17', raised: '#1d2a20', panel: '#19241c', hover: '#26372a', active: '#2f4534',
    border: '#2c3f31', borderStrong: '#3f5a46', text: '#e8f0e9', textDim: '#a3b8a7',
    accent: '#8be26a', accentStrong: '#4caf50', accentText: '#0b1a08', danger: '#ff7b7b', file: '#a9c9ad',
  }, { keyword: '#d9a0ff', string: '#8be26a', number: '#ffb86c', comment: '#7c9583', function: '#7fd1ff', type: '#ffd27f', variable: '#e8f0e9', property: '#7ee0c4', operator: '#a3d5ff', bracket: '#d0e0d2', tag: '#ff8b8b', meta: '#a3b8a7', regexp: '#ffb86c', heading: '#8be26a', link: '#7fd1ff', constant: '#ffb3c6' }),
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
  }, { keyword: '#ffff00', string: '#7fff7f', number: '#ff9d5c', comment: '#b0b0b0', function: '#7fdfff', type: '#ffd27f', variable: '#ffffff', property: '#c8ffff', operator: '#ffffff', bracket: '#ffffff', tag: '#ffff00', meta: '#ff9dff', regexp: '#ff9d5c', heading: '#7fdfff', link: '#7fdfff', constant: '#ff9dff' }),
  mk('nord', '노르드', 'Nord', 'dark', {
    bg: '#2e3440', raised: '#3b4252', panel: '#343b4a', hover: '#434c5e', active: '#4c566a',
    border: '#434c5e', borderStrong: '#5b667a', text: '#eceff4', textDim: '#d8dee9',
    accent: '#88c0d0', accentStrong: '#5e81ac', accentText: '#1b2430', danger: '#bf616a', folder: '#ebcb8b', file: '#b8c5d6',
  }, { keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', comment: '#7b88a1', function: '#88c0d0', type: '#8fbcbb', variable: '#d8dee9', property: '#8fbcbb', operator: '#81a1c1', bracket: '#eceff4', tag: '#81a1c1', meta: '#5e81ac', regexp: '#ebcb8b', heading: '#88c0d0', link: '#88c0d0', constant: '#d08770' }),
  mk('dracula', '드라큘라', 'Dracula', 'dark', {
    bg: '#282a36', raised: '#343746', panel: '#2d2f3d', hover: '#3d4052', active: '#44475a',
    border: '#44475a', borderStrong: '#6272a4', text: '#f8f8f2', textDim: '#bfc2d0',
    accent: '#bd93f9', accentStrong: '#ff79c6', accentText: '#1a1023', danger: '#ff5555', folder: '#f1fa8c', file: '#8be9fd',
  }, { keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', comment: '#6272a4', function: '#50fa7b', type: '#8be9fd', variable: '#f8f8f2', property: '#66d9ef', operator: '#ff79c6', bracket: '#f8f8f2', tag: '#ff79c6', meta: '#bd93f9', regexp: '#f1fa8c', heading: '#bd93f9', link: '#8be9fd', constant: '#bd93f9' }),
  mk('solarizedDark', '솔라라이즈드 다크', 'Solarized Dark', 'dark', {
    bg: '#002b36', raised: '#073642', panel: '#03303c', hover: '#0d4452', active: '#175261',
    border: '#0d4452', borderStrong: '#2a6b7c', text: '#eee8d5', textDim: '#93a1a1',
    accent: '#2aa198', accentStrong: '#268bd2', accentText: '#00201c', danger: '#dc322f', folder: '#b58900', file: '#93a1a1',
  }, { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#586e75', function: '#268bd2', type: '#b58900', variable: '#93a1a1', property: '#268bd2', operator: '#859900', bracket: '#93a1a1', tag: '#268bd2', meta: '#cb4b16', regexp: '#dc322f', heading: '#268bd2', link: '#2aa198', constant: '#cb4b16' }),
  mk('solarizedLight', '솔라라이즈드 라이트', 'Solarized Light', 'light', {
    bg: '#fdf6e3', raised: '#fffdf5', panel: '#f5efdc', hover: '#eee8d5', active: '#e3dcc6',
    border: '#e3dcc6', borderStrong: '#c8c0a8', text: '#586e75', textDim: '#657b83',
    accent: '#268bd2', accentStrong: '#2aa198', accentText: '#ffffff', danger: '#dc322f', folder: '#b58900', file: '#839496',
  }, { keyword: '#859900', string: '#2aa198', number: '#d33682', comment: '#93a1a1', function: '#268bd2', type: '#b58900', variable: '#586e75', property: '#268bd2', operator: '#859900', bracket: '#586e75', tag: '#268bd2', meta: '#cb4b16', regexp: '#dc322f', heading: '#268bd2', link: '#2aa198', constant: '#cb4b16' }),
  mk('monokai', '모노카이', 'Monokai', 'dark', {
    bg: '#272822', raised: '#32332c', panel: '#2c2d26', hover: '#3c3d36', active: '#49483e',
    border: '#3e3f38', borderStrong: '#5b5c52', text: '#f8f8f2', textDim: '#c8c8bf',
    accent: '#a6e22e', accentStrong: '#e6db74', accentText: '#1b1f0a', danger: '#f92672', folder: '#e6db74', file: '#66d9ef',
  }, { keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', function: '#a6e22e', type: '#66d9ef', variable: '#f8f8f2', property: '#a6e22e', operator: '#f92672', bracket: '#f8f8f2', tag: '#f92672', meta: '#fd971f', regexp: '#e6db74', heading: '#a6e22e', link: '#66d9ef', constant: '#ae81ff' }),
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
  }, { keyword: '#e0a458', string: '#b5d99c', number: '#f0b27a', comment: '#8a7a6d', function: '#f4d7a7', type: '#e6c384', variable: '#f1e9e2', property: '#c9b5a2', operator: '#d9b99b', bracket: '#f1e9e2', tag: '#e0a458', meta: '#bfae9f', regexp: '#f0b27a', heading: '#e0a458', link: '#e0a458', constant: '#ffb3a7' }),
  mk('cherry', '체리', 'Cherry', 'dark', {
    bg: '#1c1216', raised: '#271a20', panel: '#21161b', hover: '#33222a', active: '#402b35',
    border: '#3b2530', borderStrong: '#5a3747', text: '#f6e7ec', textDim: '#c49aab',
    accent: '#ff5c8a', accentStrong: '#e0245e', accentText: '#2b0410', danger: '#ff8c7a', folder: '#ff9db8', file: '#d9b3c0',
  }, { keyword: '#ff5c8a', string: '#ffd6a5', number: '#f9a8d4', comment: '#8c6a77', function: '#ffb3c6', type: '#fcd5ce', variable: '#f6e7ec', property: '#e8a2b8', operator: '#ff8fab', bracket: '#f6e7ec', tag: '#ff5c8a', meta: '#c49aab', regexp: '#ffd6a5', heading: '#ff5c8a', link: '#ff9db8', constant: '#f9a8d4' }),
  mk('cyber', '사이버', 'Cyber', 'dark', {
    bg: '#0b0b12', raised: '#14121f', panel: '#100f1a', hover: '#1d1a2e', active: '#27233c',
    border: '#252238', borderStrong: '#3d3860', text: '#eae6ff', textDim: '#9d94c9',
    accent: '#ff2fd6', accentStrong: '#c400a8', accentText: '#2a0022', danger: '#ff6b6b', folder: '#7cf9ff', file: '#b9b0e6',
  }, { keyword: '#ff2fd6', string: '#7cf9ff', number: '#ffd166', comment: '#6d63a3', function: '#a3a1ff', type: '#7cf9ff', variable: '#eae6ff', property: '#c9a8ff', operator: '#ff7ae6', bracket: '#eae6ff', tag: '#ff2fd6', meta: '#9d94c9', regexp: '#ffd166', heading: '#ff2fd6', link: '#7cf9ff', constant: '#ffd166' }),
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
  mk('gruvboxDark', '그루브박스 다크', 'Gruvbox Dark', 'dark', {
    bg: '#282828', raised: '#3c3836', panel: '#32302f', hover: '#504945', active: '#665c54',
    border: '#3c3836', borderStrong: '#665c54', text: '#ebdbb2', textDim: '#a89984',
    accent: '#fabd2f', accentStrong: '#d79921', accentText: '#282828', danger: '#fb4934', folder: '#fabd2f', file: '#83a598',
  }, { keyword: '#fb4934', string: '#b8bb26', number: '#d3869b', comment: '#928374', function: '#b8bb26', type: '#fabd2f', variable: '#ebdbb2', property: '#8ec07c', operator: '#8ec07c', bracket: '#ebdbb2', tag: '#8ec07c', meta: '#d3869b', regexp: '#b8bb26', heading: '#83a598', link: '#83a598', constant: '#d3869b' }),
  mk('oneDark', '원 다크', 'One Dark', 'dark', {
    bg: '#282c34', raised: '#31353f', panel: '#21252b', hover: '#3a3f4b', active: '#3e4451',
    border: '#3a3f4b', borderStrong: '#4b5263', text: '#abb2bf', textDim: '#7f848e',
    accent: '#61afef', accentStrong: '#528bff', accentText: '#0b1220', danger: '#e06c75', folder: '#e5c07b', file: '#61afef',
  }, { keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', function: '#61afef', type: '#e5c07b', variable: '#abb2bf', property: '#56b6c2', operator: '#56b6c2', bracket: '#abb2bf', tag: '#e06c75', meta: '#c678dd', regexp: '#98c379', heading: '#61afef', link: '#56b6c2', constant: '#d19a66' }),
  mk('tokyoNight', '도쿄 나이트', 'Tokyo Night', 'dark', {
    bg: '#1a1b26', raised: '#24283b', panel: '#1f2335', hover: '#2f334d', active: '#364a82',
    border: '#2a2f41', borderStrong: '#3b4261', text: '#c0caf5', textDim: '#9aa5ce',
    accent: '#7aa2f7', accentStrong: '#bb9af7', accentText: '#0b1020', danger: '#f7768e', folder: '#e0af68', file: '#7dcfff',
  }, { keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', function: '#7aa2f7', type: '#2ac3de', variable: '#c0caf5', property: '#73daca', operator: '#89ddff', bracket: '#c0caf5', tag: '#f7768e', meta: '#bb9af7', regexp: '#b4f9f8', heading: '#7aa2f7', link: '#7dcfff', constant: '#ff9e64' }),
  mk('githubDark', '깃허브 다크', 'GitHub Dark', 'dark', {
    bg: '#0d1117', raised: '#161b22', panel: '#11161d', hover: '#1f2630', active: '#263040',
    border: '#30363d', borderStrong: '#484f58', text: '#e6edf3', textDim: '#8b949e',
    accent: '#58a6ff', accentStrong: '#1f6feb', accentText: '#04121f', danger: '#f85149', folder: '#e3b341', file: '#79c0ff',
  }, { keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', comment: '#8b949e', function: '#d2a8ff', type: '#ffa657', variable: '#e6edf3', property: '#79c0ff', operator: '#ff7b72', bracket: '#e6edf3', tag: '#7ee787', meta: '#d2a8ff', regexp: '#a5d6ff', heading: '#79c0ff', link: '#58a6ff', constant: '#79c0ff' }),
  mk('catppuccin', '카푸친 모카', 'Catppuccin Mocha', 'dark', {
    bg: '#1e1e2e', raised: '#313244', panel: '#181825', hover: '#45475a', active: '#585b70',
    border: '#313244', borderStrong: '#585b70', text: '#cdd6f4', textDim: '#a6adc8',
    accent: '#89b4fa', accentStrong: '#cba6f7', accentText: '#11111b', danger: '#f38ba8', folder: '#f9e2af', file: '#89dceb',
  }, { keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', comment: '#6c7086', function: '#89b4fa', type: '#f9e2af', variable: '#cdd6f4', property: '#94e2d5', operator: '#89dceb', bracket: '#cdd6f4', tag: '#f38ba8', meta: '#f5c2e7', regexp: '#fab387', heading: '#89b4fa', link: '#89dceb', constant: '#fab387' }),
  mk('slate', '슬레이트', 'Slate', 'dark', {
    bg: '#171b21', raised: '#1f242c', panel: '#1b2027', hover: '#272e38', active: '#313a46',
    border: '#2a323c', borderStrong: '#3e4a58', text: '#dfe6ee', textDim: '#93a0b0',
    accent: '#7dd3fc', accentStrong: '#38bdf8', accentText: '#062030', danger: '#fb7185', folder: '#fcd34d', file: '#9fb3c8',
  }),
  mk('abyss', '어비스', 'Abyss', 'dark', {
    bg: '#060b1a', raised: '#0f1630', panel: '#0a1024', hover: '#182141', active: '#222d55',
    border: '#1b2446', borderStrong: '#2d3a6b', text: '#dce4ff', textDim: '#8d98c7',
    accent: '#4d7cff', accentStrong: '#2b55e0', accentText: '#eaf0ff', danger: '#ff6b81', folder: '#ffd166', file: '#8fb2ff',
  }, { keyword: '#8ab4ff', string: '#9ef0d1', number: '#ffd166', comment: '#5a6490', function: '#c3b1ff', type: '#7ee0ff', variable: '#dce4ff', property: '#9ef0d1', operator: '#8fb2ff', bracket: '#dce4ff', tag: '#ff8fab', meta: '#c3b1ff', regexp: '#ffd166', heading: '#4d7cff', link: '#7ee0ff', constant: '#ffd166' }),
  mk('matrix', '매트릭스', 'Matrix', 'dark', {
    bg: '#050a06', raised: '#0d1a0f', panel: '#08120a', hover: '#142816', active: '#1c3a1f',
    border: '#16301a', borderStrong: '#245c2b', text: '#c8f7c5', textDim: '#6fbf73',
    accent: '#39ff14', accentStrong: '#00c853', accentText: '#021405', danger: '#ff5252', folder: '#39ff14', file: '#8ce99a',
  }, { keyword: '#39ff14', string: '#b9f6ca', number: '#69f0ae', comment: '#4a7c52', function: '#76ff03', type: '#a7ffeb', variable: '#c8f7c5', property: '#69f0ae', operator: '#39ff14', bracket: '#c8f7c5', tag: '#76ff03', meta: '#6fbf73', regexp: '#b9f6ca', heading: '#39ff14', link: '#69f0ae', constant: '#69f0ae' }),
  mk('githubLight', '깃허브 라이트', 'GitHub Light', 'light', {
    bg: '#ffffff', raised: '#ffffff', panel: '#f6f8fa', hover: '#eaeef2', active: '#ddf4ff',
    border: '#d0d7de', borderStrong: '#afb8c1', text: '#1f2328', textDim: '#656d76',
    accent: '#0969da', accentStrong: '#0550ae', accentText: '#ffffff', danger: '#cf222e', folder: '#dbab0a', file: '#57606a',
  }, { keyword: '#cf222e', string: '#0a3069', number: '#0550ae', comment: '#6e7781', function: '#8250df', type: '#953800', variable: '#1f2328', property: '#0550ae', operator: '#cf222e', bracket: '#24292f', tag: '#116329', meta: '#8250df', regexp: '#0a3069', heading: '#0550ae', link: '#0969da', constant: '#0550ae' }),
  mk('gruvboxLight', '그루브박스 라이트', 'Gruvbox Light', 'light', {
    bg: '#fbf1c7', raised: '#fffbea', panel: '#f2e5bc', hover: '#ebdbb2', active: '#d5c4a1',
    border: '#ddcca7', borderStrong: '#bdae93', text: '#3c3836', textDim: '#665c54',
    accent: '#af3a03', accentStrong: '#9d0006', accentText: '#ffffff', danger: '#9d0006', folder: '#b57614', file: '#076678',
    shadow: '0 10px 30px rgba(90,70,20,0.18)',
  }, { keyword: '#9d0006', string: '#79740e', number: '#8f3f71', comment: '#928374', function: '#79740e', type: '#b57614', variable: '#3c3836', property: '#427b58', operator: '#af3a03', bracket: '#3c3836', tag: '#427b58', meta: '#8f3f71', regexp: '#79740e', heading: '#076678', link: '#076678', constant: '#8f3f71' }),
  mk('oneLight', '원 라이트', 'One Light', 'light', {
    bg: '#fafafa', raised: '#ffffff', panel: '#f0f0f1', hover: '#e8e8e9', active: '#d7dae0',
    border: '#dcdcdd', borderStrong: '#b8b9bb', text: '#383a42', textDim: '#696c77',
    accent: '#4078f2', accentStrong: '#2b5fd9', accentText: '#ffffff', danger: '#e45649', folder: '#c18401', file: '#0184bc',
  }, { keyword: '#a626a4', string: '#50a14f', number: '#986801', comment: '#a0a1a7', function: '#4078f2', type: '#c18401', variable: '#e45649', property: '#0184bc', operator: '#0184bc', bracket: '#383a42', tag: '#e45649', meta: '#a626a4', regexp: '#50a14f', heading: '#4078f2', link: '#0184bc', constant: '#986801' }),
  mk('latte', '카푸친 라테', 'Catppuccin Latte', 'light', {
    bg: '#eff1f5', raised: '#ffffff', panel: '#e6e9ef', hover: '#dce0e8', active: '#ccd0da',
    border: '#dce0e8', borderStrong: '#9ca0b0', text: '#4c4f69', textDim: '#6c6f85',
    accent: '#1e66f5', accentStrong: '#8839ef', accentText: '#ffffff', danger: '#d20f39', folder: '#df8e1d', file: '#209fb5',
  }, { keyword: '#8839ef', string: '#40a02b', number: '#fe640b', comment: '#9ca0b0', function: '#1e66f5', type: '#df8e1d', variable: '#4c4f69', property: '#179299', operator: '#04a5e5', bracket: '#4c4f69', tag: '#d20f39', meta: '#ea76cb', regexp: '#fe640b', heading: '#1e66f5', link: '#209fb5', constant: '#fe640b' }),
  mk('paper', '페이퍼', 'Paper', 'light', {
    bg: '#fdfcf7', raised: '#ffffff', panel: '#f5f3ea', hover: '#ece9dd', active: '#ded9c8',
    border: '#e4e0d2', borderStrong: '#c0b9a4', text: '#2f2b22', textDim: '#6d6554',
    accent: '#7a6a45', accentStrong: '#574a2f', accentText: '#ffffff', danger: '#b23a2f', folder: '#c59a3f', file: '#8a7f68',
    shadow: '0 10px 30px rgba(70,60,30,0.14)',
  }),
  mk('sky', '스카이', 'Sky', 'light', {
    bg: '#f4faff', raised: '#ffffff', panel: '#e8f3fd', hover: '#d9eafb', active: '#c3dcf5',
    border: '#cfe3f5', borderStrong: '#9cc2e5', text: '#10263a', textDim: '#4a6b85',
    accent: '#0b84d9', accentStrong: '#0b63a6', accentText: '#ffffff', danger: '#d9484f', folder: '#2f9fe0', file: '#6d8ea8',
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
  }, { keyword: '#0000cc', string: '#006b00', number: '#a33000', comment: '#4d4d4d', function: '#6a00a3', type: '#8a4b00', variable: '#000000', property: '#005f73', operator: '#000000', bracket: '#000000', tag: '#8b0000', meta: '#6a00a3', regexp: '#a33000', heading: '#0000cc', link: '#0000cc', constant: '#6a00a3' }),
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

export const DEFAULT_THEME = 'midnight';

// ── Custom themes ─────────────────────────────────────────
// Made in settings › theme from any built-in one and kept in the session as
// { id: 'custom-…', label, mode, colors } (the base colours `mk` takes; the
// syntax palette follows the mode). setCustomThemes() registers them so
// every lookup (picker, cycling, apply) sees built-in and custom alike.
export const CUSTOM_COLOR_KEYS = ['bg', 'panel', 'raised', 'hover', 'active', 'border', 'borderStrong', 'text', 'textDim', 'accent', 'accentStrong', 'accentText', 'folder', 'file', 'danger'];
let customThemes = [];
export function setCustomThemes(list) {
  customThemes = (Array.isArray(list) ? list : []).filter((c) => c && c.id && c.colors).map((c) => ({ ...mk(c.id, c.label || 'Custom', c.label || 'Custom', c.mode === 'light' ? 'light' : 'dark', c.colors), custom: true }));
}
export function getCustomThemes() { return customThemes; }
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
