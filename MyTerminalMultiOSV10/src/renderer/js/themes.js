let themes = null;

export async function loadThemes() {
  if (themes) return themes;
  const res = await fetch('./shared/themes/themes.json');
  themes = await res.json();
  return themes;
}

export function getThemeList(themesMap) {
  return Object.keys(themesMap);
}

export function resolveTheme(themesMap, themeId, custom) {
  if (themeId === 'custom' && custom) {
    return { ...themesMap.dark, ...custom, id: 'custom' };
  }
  return themesMap[themeId] || themesMap.dark;
}

export function clampTransparency(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** transparency 0 = opaque, 100 = fully transparent */
export function transparencyToAlpha(transparency) {
  return (100 - clampTransparency(transparency)) / 100;
}

export function colorWithAlpha(color, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const raw = String(color || '#000000').trim();

  if (raw.startsWith('rgba(')) {
    return raw.replace(/rgba\(([^)]+)\)/, (_, body) => {
      const parts = body.split(',').map((p) => p.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`;
    });
  }
  if (raw.startsWith('rgb(')) {
    return raw.replace(/rgb\(([^)]+)\)/, (_, body) => `rgba(${body}, ${a})`);
  }

  let hex = raw.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (hex.length >= 6) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  return `rgba(30, 30, 30, ${a})`;
}

function cssUrl(value) {
  if (!value) return 'none';
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${escaped}")`;
}

export function applyThemeToDocument(
  theme,
  transparency = 0,
  backgroundImage = '',
  backgroundFit = null
) {
  const root = document.documentElement;
  const alpha = transparencyToAlpha(transparency);
  const solidBg = theme.background;
  const glassBg = colorWithAlpha(theme.background, alpha);

  root.style.setProperty('--bg', glassBg);
  root.style.setProperty('--bg-solid', solidBg);
  root.style.setProperty('--bg-image', cssUrl(backgroundImage));
  root.style.setProperty('--fg', theme.foreground);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--toolbar-bg', theme.toolbarBg);
  root.style.setProperty('--toolbar-fg', theme.toolbarFg);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--button-hover', theme.buttonHover);
  root.style.setProperty('--danger', theme.danger);
  root.style.setProperty('--bg-transparency', String(clampTransparency(transparency)));
  document.body.classList.toggle('has-bg-image', !!backgroundImage);

  if (backgroundFit) {
    root.style.setProperty('--bg-size', backgroundFit.size);
    root.style.setProperty('--bg-position', backgroundFit.position);
    root.style.setProperty('--bg-repeat', backgroundFit.repeat);
    document.body.dataset.bgFit = backgroundFit.id;
  }

  document.body.classList.toggle('theme-light', theme.id === 'light');
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

export function toXtermTheme(theme, transparency = 0) {
  const t = theme.terminal || {};
  const alpha = transparencyToAlpha(transparency);
  const background = colorWithAlpha(theme.background, alpha);
  return {
    background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    cursorAccent: theme.background,
    selectionBackground: theme.selection,
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
  };
}

export function defaultCustomFrom(theme) {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    selection: theme.selection,
    accent: theme.accent,
    toolbarBg: theme.toolbarBg,
    toolbarFg: theme.toolbarFg,
    border: theme.border,
    buttonHover: theme.buttonHover,
    danger: theme.danger,
    terminal: { ...(theme.terminal || {}) },
  };
}
