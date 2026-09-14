// Themes: flat token maps applied to :root as CSS custom properties, so every
// surface — main window and dialog windows alike — picks up the same palette.

export const THEMES = [
  {
    id: 'midnight', label: '미드나이트', labelEn: 'Midnight', mode: 'dark',
    tokens: {
      '--bg': '#12161c', '--bg-raised': '#1a2029', '--bg-panel': '#161b23', '--bg-input': '#0e1218',
      '--bg-hover': '#232b36', '--bg-active': '#2b3644', '--bg-canvas': '#0b0e12',
      '--border': '#2a3441', '--border-strong': '#3b4859',
      '--text': '#e4e9f0', '--text-dim': '#97a3b4', '--text-faint': '#6b7789',
      '--accent': '#4cc9f0', '--accent-strong': '#4361ee', '--accent-text': '#06202b',
      '--danger': '#ff6b6b', '--danger-bg': '#3a1c22', '--warning': '#ffb703', '--ok': '#4ade80',
      '--shadow': '0 8px 28px rgba(0,0,0,0.5)', '--titlebar': '#0e1217', '--selection': '#4cc9f0',
    },
  },
  {
    id: 'daylight', label: '데이라이트', labelEn: 'Daylight', mode: 'light',
    tokens: {
      '--bg': '#f6f7f9', '--bg-raised': '#ffffff', '--bg-panel': '#eef1f5', '--bg-input': '#ffffff',
      '--bg-hover': '#e4e9f0', '--bg-active': '#d6dee9', '--bg-canvas': '#dfe4ea',
      '--border': '#d3dae3', '--border-strong': '#aab6c5',
      '--text': '#1c2530', '--text-dim': '#586372', '--text-faint': '#8a94a3',
      '--accent': '#1565c0', '--accent-strong': '#0d47a1', '--accent-text': '#ffffff',
      '--danger': '#c62828', '--danger-bg': '#fde7e7', '--warning': '#b26a00', '--ok': '#2e7d32',
      '--shadow': '0 8px 28px rgba(20,30,50,0.18)', '--titlebar': '#e9edf2', '--selection': '#1565c0',
    },
  },
  {
    id: 'graphite', label: '그라파이트', labelEn: 'Graphite', mode: 'dark',
    tokens: {
      '--bg': '#1e1e1e', '--bg-raised': '#262626', '--bg-panel': '#222222', '--bg-input': '#171717',
      '--bg-hover': '#303030', '--bg-active': '#3a3a3a', '--bg-canvas': '#141414',
      '--border': '#353535', '--border-strong': '#4a4a4a',
      '--text': '#ececec', '--text-dim': '#a8a8a8', '--text-faint': '#767676',
      '--accent': '#ffb347', '--accent-strong': '#f28c28', '--accent-text': '#1e1200',
      '--danger': '#ff7070', '--danger-bg': '#3a2020', '--warning': '#ffd166', '--ok': '#7ddf8a',
      '--shadow': '0 8px 28px rgba(0,0,0,0.55)', '--titlebar': '#181818', '--selection': '#ffb347',
    },
  },
  {
    id: 'ocean', label: '오션', labelEn: 'Ocean', mode: 'dark',
    tokens: {
      '--bg': '#0f1f2a', '--bg-raised': '#153040', '--bg-panel': '#122735', '--bg-input': '#0b1720',
      '--bg-hover': '#1d3d50', '--bg-active': '#254b62', '--bg-canvas': '#081319',
      '--border': '#234456', '--border-strong': '#33607a',
      '--text': '#e2f1f8', '--text-dim': '#9cc0d3', '--text-faint': '#6a8fa3',
      '--accent': '#2ee6c5', '--accent-strong': '#14b8a6', '--accent-text': '#03211c',
      '--danger': '#ff7b7b', '--danger-bg': '#3d1f2a', '--warning': '#ffd166', '--ok': '#6ee7b7',
      '--shadow': '0 8px 28px rgba(0,10,20,0.55)', '--titlebar': '#0b1922', '--selection': '#2ee6c5',
    },
  },
  {
    id: 'forest', label: '포레스트', labelEn: 'Forest', mode: 'dark',
    tokens: {
      '--bg': '#151d17', '--bg-raised': '#1d2a20', '--bg-panel': '#19241c', '--bg-input': '#0f1611',
      '--bg-hover': '#26372a', '--bg-active': '#2f4534', '--bg-canvas': '#0c120e',
      '--border': '#2c3f31', '--border-strong': '#3f5a46',
      '--text': '#e8f0e9', '--text-dim': '#a3b8a7', '--text-faint': '#748a78',
      '--accent': '#8be26a', '--accent-strong': '#4caf50', '--accent-text': '#0b1a08',
      '--danger': '#ff7b7b', '--danger-bg': '#3d2222', '--warning': '#ffd166', '--ok': '#8be26a',
      '--shadow': '0 8px 28px rgba(0,0,0,0.5)', '--titlebar': '#101712', '--selection': '#8be26a',
    },
  },
  {
    id: 'sunset', label: '선셋', labelEn: 'Sunset', mode: 'light',
    tokens: {
      '--bg': '#fbf4ee', '--bg-raised': '#ffffff', '--bg-panel': '#f6ebe2', '--bg-input': '#ffffff',
      '--bg-hover': '#f0dfd2', '--bg-active': '#e8cfbc', '--bg-canvas': '#eadfd5',
      '--border': '#e3d1c4', '--border-strong': '#c9ac98',
      '--text': '#3a2a22', '--text-dim': '#7a6257', '--text-faint': '#a48f84',
      '--accent': '#e0563a', '--accent-strong': '#b93a22', '--accent-text': '#ffffff',
      '--danger': '#c62828', '--danger-bg': '#fde3e3', '--warning': '#b26a00', '--ok': '#2e7d32',
      '--shadow': '0 8px 28px rgba(80,40,20,0.18)', '--titlebar': '#f2e6dc', '--selection': '#e0563a',
    },
  },
  {
    id: 'contrast', label: '고대비', labelEn: 'High Contrast', mode: 'dark',
    tokens: {
      '--bg': '#000000', '--bg-raised': '#0d0d0d', '--bg-panel': '#080808', '--bg-input': '#000000',
      '--bg-hover': '#1f1f1f', '--bg-active': '#333333', '--bg-canvas': '#000000',
      '--border': '#6f6f6f', '--border-strong': '#ffffff',
      '--text': '#ffffff', '--text-dim': '#e0e0e0', '--text-faint': '#b0b0b0',
      '--accent': '#ffff00', '--accent-strong': '#ffd600', '--accent-text': '#000000',
      '--danger': '#ff5252', '--danger-bg': '#3a0000', '--warning': '#ffab00', '--ok': '#69f0ae',
      '--shadow': '0 0 0 2px #ffffff', '--titlebar': '#000000', '--selection': '#ffff00',
    },
  },
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
